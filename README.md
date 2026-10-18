# Naidamn

面向安卓手机和平板的离线 408 知识点定位与电子书阅读应用。根据四科思维导图搜索知识点，直接跳到对应王道课本页范围。

## 安装

从本仓库 [Releases](../../releases/latest) 下载 `Naidamn-1.3.0.apk`，最低 Android 8.0。手机和平板使用同一个安装包，支持横竖屏。正式版沿用原包名与签名，可直接覆盖升级，不需要卸载旧版。校验文件为 `SHA256.txt`。

应用离线运行，无需登录，不申请联网或存储权限。笔记导入导出使用系统文件选择器。当前版本完成浏览器功能回归以及 APK 签名、对齐和资源一致性检查，尚未进行安卓真机安装验证。

## 功能

- 名称、缩写、别名搜索与思维导图分支展开，定位课本中的对应范围。
- 四本电子书，共 1,432 页；26 章、768 个章节／小节目录入口。
- 50%–400% 双指缩放、页面拖动、上下／左右边缘翻页、旋转阅读位置恢复。
- 手写与划线笔记、五种颜色、必填标签、撤销、草稿暂存、编辑及确认删除。
- 书内及首页手动切换知识点／笔记标签检索，点击跳转对应页。
- JSON 笔记导出与导入：预览后确认，重复内容跳过，同 ID 内容不同另存；保留现有笔记及草稿。
- 最近五条搜索、搜索频率、周末报告和相应开关。

笔记和偏好保存在当前设备，不自动同步。导出备份不包含草稿和原书图片。PDF 页码采用含封面与前言的物理页码。

## 源码与资源

仓库包含应用源码、图标、运行索引、必要的索引来源和构建脚本。没有上传测试文件、测试截图／报告、缓存、旧版存档、Android 工具链、签名密钥或个人配置。

原始资料已通过 Git LFS 保存：`知识点参考书/` 内四本课本、`思维导图/` 内四份导图、`考试大纲/` 内一份考试大纲，共 9 份 PDF。文件内容保持原样，校验清单见 `reference-files.json`。

安装 Git LFS 后，在克隆的仓库根目录运行 `git lfs install` 和 `git lfs pull`，即可下载完整 PDF；不要把 LFS 指针文本当作 PDF。也可以登录 GitHub 后打开对应文件并下载原始文件。

逐页图片仍不进入 Git 历史；完整离线页包含在私有 Release 的 APK 中。已有阅读权限的使用者可从该 APK 恢复页面到本地：

```powershell
python scripts/restore_book_assets.py path/to/Naidamn-1.3.0.apk
python -m http.server 4088 --bind 127.0.0.1 --directory app/assets
```

然后打开 http://127.0.0.1:4088/ 。未恢复页面时，搜索界面可以打开，但无法展示书页。网页与安卓使用同一套前端源码。

## 构建安卓包

在仓库根目录准备 Python 3.10+、JDK 17，以及官方 Android SDK 工具：

- `tools/android/android-35/android.jar`：Android 35 平台文件。
- `tools/android/android-15/`：Android build-tools 35 对应工具，包含 aapt.exe、zipalign.exe、core-lambda-stubs.jar 及 lib 下的 d8.jar、apksigner.jar。
- `app/assets/books/{ds,co,os,net}/`：按上述命令恢复的书页资源。

```powershell
python -m pip install -r requirements.txt
python scripts/build_apk.py
python scripts/verify_apk.py
```

产物在 `output/`。构建脚本首次使用时会在被忽略的 `tools/private-signing/` 生成本地签名。要覆盖已有正式版，必须在本地使用原有签名密钥；新生成的密钥无法覆盖原版，切勿把密钥提交到仓库。

运行索引已包含在仓库，不必重复生成。若需重建导图和目录，先运行 `git lfs pull` 取得原始 PDF，再建立 `tmp/` 并运行 `npm run build:index`。四科课本文件名分别为 `2027数据结构.pdf`、`2027计算机组成原理.pdf`、`2027操作系统.pdf`、`2027计算机网络.pdf`。导图目录按数据结构、组成原理、操作系统、计算机网络的名称前缀识别。

## 资料边界

原书与导图的版权归原权利人所有。本仓库保持私有，用于个人学习与项目保存；不声明对参考书、导图和用户提供图标拥有再分发授权。源码未指定开源许可证。导图节点和课本范围可能多对一，索引数量不代表独立知识点总数。
