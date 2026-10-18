"""Verify release contents against the current offline app and previous signing key."""
import hashlib
import json
import re
import subprocess
import zipfile
from io import BytesIO
from pathlib import Path
from PIL import Image
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
manifest=ET.parse(ROOT / 'app/AndroidManifest.xml').getroot()
version=manifest.get('{http://schemas.android.com/apk/res/android}versionName')
version_code=manifest.get('{http://schemas.android.com/apk/res/android}versionCode')
assert re.fullmatch(r'\d+\.\d+\.\d+',version),'Invalid release version'
APK = ROOT / f'output/Naidamn-{version}.apk'
TOOLS = ROOT / 'tools/android/android-15'


def run(*args):
    # Native aapt/zipalign on Windows need ASCII relative paths in this workspace.
    argv = [a.relative_to(ROOT).as_posix() if isinstance(a, Path) and a.is_relative_to(ROOT)
            else str(a) for a in args]
    result = subprocess.run(argv, cwd=ROOT, capture_output=True,
                            text=True, encoding='utf-8', errors='replace', check=True)
    return result.stdout


def certificate(apk):
    result = run('java', '-jar', TOOLS / 'lib/apksigner.jar', 'verify', '--print-certs', apk)
    match = re.search(r'Signer #1 certificate SHA-256 digest: (\S+)', result)
    assert match, 'Signing certificate not found'
    return match[1]


with zipfile.ZipFile(APK) as archive:
    names = archive.namelist()
    assert len(names) == len(set(names)), 'Duplicate archive entries'
    assert archive.testzip() is None, 'Archive CRC failure'
    expected = {'assets/' + p.relative_to(ROOT / 'app/assets').as_posix(): p
                for p in (ROOT / 'app/assets').rglob('*') if p.is_file()}
    assert {n for n in names if n.startswith('assets/')} == set(expected), 'Stale or missing assets'
    for name, path in expected.items():
        assert hashlib.sha256(archive.read(name)).digest() == hashlib.sha256(path.read_bytes()).digest(), name
    assert not any(n.startswith('lib/') for n in names), 'Unexpected architecture-specific native code'
    assert sorted(n for n in names if re.fullmatch(r'classes\d*\.dex', n)) == ['classes.dex']
    for density in ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']:
        icon = f'res/mipmap-{density}-v4/ic_launcher.png'
        # aapt crunches resource PNGs, so compare decoded pixels, not compression bytes.
        with Image.open(BytesIO(archive.read(icon))) as packed, Image.open(ROOT / f'app/res/mipmap-{density}/ic_launcher.png') as original:
            assert packed.size == original.size
            assert packed.convert('RGBA').tobytes() == original.convert('RGBA').tobytes()
    counts = {sub: sum(n.startswith(f'assets/books/{sub}/') and n.endswith('.webp') for n in names)
              for sub in ['ds', 'co', 'os', 'net']}
    assert counts == {'ds': 404, 'co': 340, 'os': 372, 'net': 316}, counts

badging = run(TOOLS / 'aapt.exe', 'dump', 'badging', APK)
assert f"name='cn.zhixu.study' versionCode='{version_code}' versionName='{version}'" in badging
assert "application-label:'Naidamn'" in badging and "sdkVersion:'26'" in badging
assert "supports-screens: 'small' 'normal' 'large' 'xlarge'" in badging
assert 'uses-permission:' not in badging
new_certificate = certificate(APK)
previous = [p for p in (ROOT / 'output').glob('*.apk') if p!=APK]
same_signer = all(certificate(p) == new_certificate for p in previous)
assert same_signer, 'Previous app has a different signer'
# zipalign's successful exit status is authoritative; some Windows builds emit
# the verbose verification text to stderr instead of stdout.
run(TOOLS / 'zipalign.exe', '-c', '-v', '4', APK)
report = dict(apk=APK.name, version=version, sizeBytes=APK.stat().st_size,
              sha256=hashlib.sha256(APK.read_bytes()).hexdigest(),
              minAndroid='8.0 (API 26)', screens=['small', 'normal', 'large', 'xlarge'],
              architecture='DEX only; no architecture-specific native library',
              matchingPreviousSigningCertificate=same_signer, previousVersionsChecked=[p.name for p in previous], permissions=[],
              assetFiles=len(expected), bookPageCounts=counts,
              allAssetBytesMatchCurrentSource=True, archiveCRC=True, zipAlignment=True,
              physicalDeviceInstallTested=False)
(ROOT / 'output/apk-content-verification.json').write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f"PASS: {APK.name}; {len(expected)} current assets including {sum(counts.values())} book pages; "
      'matching previous signing certificate; no permissions; all screen sizes; CRC and alignment valid')
