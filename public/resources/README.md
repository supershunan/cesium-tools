# Playground 样例数据

本地 Demo（`npm run dev`）依赖 `public/resources/` 下部分文件。**大体积二进制默认不纳入 Git**，克隆仓库后需自行准备。

## 仓库内保留（小文件）

| 文件        | 用途                    |
| ----------- | ----------------------- |
| `grid.json` | BuildProject 等网格示例 |

## 需本地放置（已 gitignore）

| 路径          | 引用位置                                  |
| ------------- | ----------------------------------------- |
| `slope/*.dat` | `playground/components/SlopeProject`      |
| `slope/*.tif` | 可选，本地 GDAL/预览                      |
| `*.zip`       | 雷达格点 Demo（如 `closeToTheGround` 等） |

将文件放到对应目录后，在仓库根目录执行：

```bash
npm run playground:check-data
```

会列出缺失项。

## 从 Git 历史中移除已跟踪的大文件（可选）

若此前已提交过 zip/dat/tif，可在确认备份后：

```bash
git rm --cached public/resources/**/*.zip public/resources/**/*.dat public/resources/**/*.tif
git commit -m "chore: stop tracking large playground binaries"
```

本地文件不会被删除，仅不再纳入版本库。

## 内网 / 对象存储

团队可维护一份「playground 数据包」放在内网盘或 OSS，在 README 或 Wiki 中写下载链接与校验和（SHA256），与本目录结构对齐即可。
