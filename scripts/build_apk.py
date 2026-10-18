"""Build using official Android build-tools and JDK 17; no Gradle daemon needed."""
from pathlib import Path
import subprocess,os,zipfile,secrets,hashlib,re
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
TOOLS=ROOT/'tools/android/android-15'
ANDROID=ROOT/'tools/android/android-35/android.jar'
BUILD=ROOT/'build'; BUILD.mkdir(exist_ok=True)
OUT=ROOT/'output';OUT.mkdir(exist_ok=True)
PRIVATE=ROOT/'tools/private-signing';PRIVATE.mkdir(exist_ok=True)
def run(args):
    # Native Windows aapt expects narrow paths. Relative ASCII paths avoid Chinese-path decoding errors.
    argv=[x.relative_to(ROOT).as_posix() if isinstance(x,Path) and x.is_relative_to(ROOT) else str(x) for x in args]
    result=subprocess.run(argv,cwd=ROOT,check=False,capture_output=True,text=True,encoding='utf-8',errors='replace')
    if result.stdout: print(result.stdout.strip(),flush=True)
    if result.stderr: print(result.stderr.strip(),flush=True)
    result.check_returncode()
    return result
classes=BUILD/'lookup-classes';classes.mkdir(exist_ok=True)
# Do not package stale classes from the retired backup/learning interfaces.
for p in classes.rglob('*.class'):
    if p.is_symlink() or not p.resolve().is_relative_to(classes.resolve()):raise ValueError('Unsafe generated class path')
    p.unlink()
dex=BUILD/'dex';dex.mkdir(exist_ok=True)
run(['javac','-J-Dfile.encoding=UTF-8','-encoding','UTF-8','-source','8','-target','8','-bootclasspath',str(ANDROID)+os.pathsep+str(TOOLS/'core-lambda-stubs.jar'),'-d',classes,*sorted((ROOT/'app/src').rglob('*.java'))])
run(['java','-cp',TOOLS/'lib/d8.jar','com.android.tools.r8.D8','--lib',ANDROID,'--min-api','26','--output',dex,*sorted(classes.rglob('*.class'))])
run([TOOLS/'aapt.exe','package','-f','-M',ROOT/'app/AndroidManifest.xml','-S',ROOT/'app/res','-A',ROOT/'app/assets','-I',ANDROID,'-0','webp','-F',BUILD/'unsigned.apk'])
with zipfile.ZipFile(BUILD/'unsigned.apk','a',compression=zipfile.ZIP_DEFLATED) as z:
    for p in dex.glob('*.dex'):z.write(p,p.name)
run([TOOLS/'zipalign.exe','-f','4',BUILD/'unsigned.apk',BUILD/'aligned.apk'])
password=PRIVATE/'password.txt'
if not password.exists():password.write_text(secrets.token_urlsafe(32),encoding='utf-8')
os.environ['ZHIXU_SIGN_PASS']=password.read_text(encoding='utf-8').strip()
key=PRIVATE/'zhixu-release.jks'
if not key.exists():run(['keytool','-genkeypair','-keystore',key,'-storepass:env','ZHIXU_SIGN_PASS','-keypass:env','ZHIXU_SIGN_PASS','-alias','zhixu','-keyalg','RSA','-keysize','2048','-validity','10000','-dname','CN=Zhixu 408, O=Personal Study, C=CN'])
version=ET.parse(ROOT/'app/AndroidManifest.xml').getroot().get('{http://schemas.android.com/apk/res/android}versionName')
assert re.fullmatch(r'\d+\.\d+\.\d+',version),'Invalid release version'
target=OUT/f'Naidamn-{version}.apk'
run(['java','-jar',TOOLS/'lib/apksigner.jar','sign','--ks',key,'--ks-key-alias','zhixu','--ks-pass','env:ZHIXU_SIGN_PASS','--key-pass','env:ZHIXU_SIGN_PASS','--out',target,BUILD/'aligned.apk'])
verification=run(['java','-jar',TOOLS/'lib/apksigner.jar','verify','--verbose',target])
manifest=run([TOOLS/'aapt.exe','dump','badging',target])
(OUT/'apk-verification.txt').write_text(verification.stdout+'\n'+manifest.stdout,encoding='utf-8')
sha=hashlib.sha256(target.read_bytes()).hexdigest()
(OUT/'SHA256.txt').write_text(sha+'  '+target.name+'\n',encoding='utf-8')
print('APK ready:',target.name,round(target.stat().st_size/1024/1024,1),'MiB',flush=True)
