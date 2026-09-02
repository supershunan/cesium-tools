# [cesium-tools-fxt](https://www.npmjs.com/package/cesium-tools-fxt)

框架无关的 Cesium 场景工具集合：测量、绘制、通视/视域、坡向、转台模拟、雷达格点栅格等。

-   **Cesium peer**：`^1.119.0`
-   **Node.js（本地开发）**：建议 `18.18.2` 或更高

## 目录

-   [包内容](#包内容)
-   [安装](#安装)
-   [快速开始](#快速开始)
-   [API 总览](#api-总览)
-   [功能说明](#功能说明)
-   [本地开发、测试与发布](#本地开发测试与发布)
-   [常见问题](#常见问题)

---

## 包内容

npm 包只提供一个入口：

```ts
import { createMeasure, GridDataReader } from 'cesium-tools-fxt';
```

发布产物仅包含框架无关的工具代码、类型声明和 `GridDataReader` Worker，不包含 React/Vue 封装、Playground、样例数据或 Cesium 静态资源。

仓库内 **`playground/`** 仅为本地联调 Demo，**不会**打进 npm 的 `dist`。

样例数据说明位于仓库的 `public/resources/README.md`，启动和检查命令见[本地开发、测试与发布](#本地开发测试与发布)。

---

## 安装

```bash
npm install cesium-tools-fxt
```

以下由 **peerDependencies** 声明，需在业务工程中安装：

`cesium`、`@turf/turf`、`@zip.js/zip.js`

```bash
npm install cesium-tools-fxt cesium @turf/turf @zip.js/zip.js
```

包不依赖 React 或 Vue，可在任意能提供 `Cesium.Viewer` 的 JavaScript/TypeScript 项目中使用。

---

## 快速开始

```ts
import * as Cesium from 'cesium';
import {
    createMeasure,
    createVisualFieldAnalysis,
    AnimatedRasterLayer,
    HardEdgeRasterLayer,
} from 'cesium-tools-fxt';

const viewer = new Cesium.Viewer('cesiumContainer');
const measure = createMeasure(viewer, Cesium);
measure.measureDistance.active({ clampToGround: true });

const visual = createVisualFieldAnalysis();
visual.setInstance(viewer);
visual.active();
```

工具使用完毕或 Viewer 销毁前，调用对应的 `deactivate`、`clear`、`cleanInstance` 或 `destroy`。

**约定**：除下文单独说明外，多数交互工具为 **左键** 选点/绘制，**右键** 结束当前操作。

---

## API 总览

以下 API 均从 `cesium-tools-fxt` 根入口导出。

| 导出                                                         | 说明                                          |
| ------------------------------------------------------------ | --------------------------------------------- |
| `GridDataReader`                                             | 雷达/格点 ZIP 解压与解析（可选 Worker）       |
| `readGridHeaderFromFile` / `readGridDataFromFile`            | 从 Blob/File 读头或全量                       |
| `readGridFromFileInput`                                      | 从 `File` 读取 `.zip`（推荐；失败 **throw**） |
| `handleFileUpload`                                           | 兼容旧版 `<input type="file">` 事件封装       |
| `shouldFlipLatitudeRowsForCesium`                            | 是否按 Cesium 贴图方向翻转纬度行              |
| `AnimatedRasterLayer`                                        | 格点贴地/Primitive 着色层                     |
| `HardEdgeRasterLayer`                                        | 硬边界单瓦片 Canvas 影像层                    |
| `EarthProjection`                                            | 格点投影到地球                                |
| `createMeasure` / `useMeasure`                               | 测量（距离/面积/角度/地表高度）               |
| `createDrawing` / `useDrawing`                               | Primitive + Entity 绘制                       |
| `createVisualFieldAnalysis` / `useVisualFieldAnalysis`       | 通视分析                                      |
| `createVisibilityAnalysis` / `useVisibilityAnalysis`         | 视域分析                                      |
| `createSlopeDirectionAnalysis` / `useSlopeDirectionAnalysis` | 坡向分析                                      |
| `createTurntableSwing` / `useTurntableSwing`                 | 雷达转台                                      |
| `createCesiumToolsEventBus` / `useCesiumToolsManage`         | 全局事件总线                                  |

类型：`Measure`、`MeasurementActions`、`DrawingActions`、`PrimitiveDrawingActions`、`EntityDrawingActions`、`VisualFieldAnalysis`、`VisibilityAnalysisProps`、`SlopDerectionAnalysis`、`TurntableSwingProps`、`DrawingTypeEnum`、`Points`；格点侧另有 `GridHeader`、`GridFrame`、`AnimatedRasterLayerHeader`、`AnimatedGridFrame`、`AnimatedRasterLayerOptions`、`HardEdgeRasterFrame`、`HardEdgeRasterLayerOptions` 等；`EarthProjection` 另导出 `GridDataHeader`、`GridData`、`ColorRule`、`ColorMode`、`EarthProjectionOptions`。

---

## 功能说明

### 测量 `useMeasure(viewer, Cesium)`

```ts
const { measureDistance, measureArea, measureAngle, measureTheHeightOfTheGround } = useMeasure(
    viewer,
    Cesium
);
```

每个子工具均提供：

-   `active(options?)`：开始测量
-   `deactivate()`：注销交互（会销毁内部 `ScreenSpaceEventHandler`）
-   `clear()`：清除当前工具产生的实体与标注
-   `addToolsEventListener(eventName, callback)` / `removeToolsEventListener(eventName, callback?)`：监听自定义事件（见下文「事件」）

#### 鼠标操作

| 工具                                       | 操作说明                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| **距离** `measureDistance`                 | **左键** 依次加点折线；**右键** 结束当前折线段并开始下一段（若继续测量） |
| **面积** `measureArea`                     | **左键** 加顶点；**右键** 闭合并完成当前多边形                           |
| **角度** `measureAngle`                    | **左键** 加折线顶点（第三点起显示夹角）；**右键** 结束（至少 3 点）      |
| **地表高度** `measureTheHeightOfTheGround` | **左键** 拾取一点并显示高度；**右键** 结束工具                           |

#### 常用选项摘要

**距离** `LengthActiveOptions`：

-   `clampToGround?`：是否贴地测距（贴地时使用地形/椭球相关距离）
-   `liveUpdateOnMove?`：默认等价 `true`；设为 `false` 则移动鼠标时不更新距离标签，仅预览折线
-   `line?`：`LabelOptions`（`template`、`customRender`、`font`、颜色、`heightReference` 贴地标签等）

**面积** `AreaActiveOptions`：

-   `clampToGround?`、`liveUpdateOnMove?`
-   `area?`：标签与 `customRender(area2d, area3d)`（平方米）

**角度** `AngleActiveOptions`：

-   `clampToGround?`、`liveUpdateOnMove?`
-   `distance?`：边长标签样式
-   `angle?`：角度标签样式

**高度** `TheHeightOfTheGroundActiveOptions`：

-   `clampToGround`（必填）
-   `height?`：标签样式

**标签 `LabelOptions`（节选）**：

-   `customRender?(value1: number, value2?: number): string`：自定义文案（距离/面积/角度含义见类型注释）
-   `template?`：占位 `{}` 替换数字字符串；面积模板可按顺序替换 **两个** `{}`（平面、测地）
-   `show?`：默认显示；`false` 隐藏标签

示例（距离，米换算公里）：

```ts
measureDistance.active({
    clampToGround: true,
    liveUpdateOnMove: true,
    line: {
        customRender: (meters) => `约 ${(meters / 1000).toFixed(3)} km`,
    },
});
```

---

### 绘制 `useDrawing(viewer, Cesium)`

返回 **`drawing`**（Primitive 路线）与 **`drawingEntity`**（Entity 路线），接口形状相同：

-   `active(options?)`：进入绘制
-   `deactivate()` / `clear()`
-   `create(id, positions, options)`：用已有坐标生成图形
-   `edit(id, viewer, options)`：编辑
-   `addToolsEventListener` / `removeToolsEventListener`

`DrawingTypeEnum` 当前包含：`POINT`、`POLYLINE`、`POLYGON`、`POLYGON_AND_POLYLINE`、`BILLBOARD`、`LABEL`。

绘制折线或面时至少需要 **3 个** 已选点后再右键结束，否则本次绘制不会完成。

---

### 通视分析 `useVisualFieldAnalysis()`

基于观测点、目标方向与视锥，在场景上叠加 **可见/不可见** 颜色（后处理 + 阴影贴图）。建议在 **3D**、有地形且开启深度时效果更稳定。

#### 初始化

```ts
const visualFieldAnalysis = useVisualFieldAnalysis();
visualFieldAnalysis.setInstance(viewer);
```

#### 鼠标操作

-   **第一次左键**：观测点（起点）
-   **移动鼠标**：预览视锥与通视
-   **第二次左键**：目标点（结束本次分析并固定结果）

（两次均为 **左键**，不是右键。）

#### API

-   `active(options?)`：`options` 可选，为 `{ startText?, endText? }`，用于提示文案
-   `deactivate()` / `clear()`
-   `getInstance()`：内部 `ViewShed` 实例（高级用法）
-   `setViewShedOptions(options)`：`ViewShedOptionalOptions`（水平/垂直角、颜色、`softShadows`、`size` 等，不含观测坐标）
-   `cleanInstance()`：销毁内部 handler 并清空引用（切换 Viewer 前建议调用）

#### 环境与性能说明

-   分析期间会临时修改 `Globe.shadows`、`viewer.shadows`、`depthTestAgainstTerrain` 等，结束后在 `clear` / `ViewShed.clear` 中会恢复。
-   若使用 **3D Tiles**，需让模型参与阴影（例如 `tileset.shadows = Cesium.ShadowMode.ENABLED`），否则遮挡可能不完整。

---

### 视域/透视分析 `useVisibilityAnalysis()`

```ts
const visibilityAnalysis = useVisibilityAnalysis();
visibilityAnalysis.setInstance(viewer);
visibilityAnalysis.active();
```

#### 鼠标操作

-   **第一次左键**：起点
-   **移动鼠标**：预览
-   **第二次左键**：终点并完成

提供 `deactivate`、`clear`、`getInstance`、`cleanInstance`、事件监听，形态与通视类似（无 `setViewShedOptions`）。

---

### 坡向分析 `useSlopeDirectionAnalysis()`

```ts
const slope = useSlopeDirectionAnalysis();
slope.setInstance(viewer);
slope.setDistance(30); // 可选，网格粒度，单位 km，最小 20
slope.active();
```

#### 鼠标操作

-   **左键**：依次添加区域顶点并预览多边形
-   **右键**：闭合区域（至少 **3** 个点）并执行分析

`setDistance(km)`：小于 `20` 会抛错。

---

### 模拟雷达转台 `useTurntableSwing()`

```ts
const turntable = useTurntableSwing();
turntable.setInstance(viewer);
turntable.active();
```

#### 鼠标操作

-   **左键一次**：在点击位置创建转台并完成交互

`globalTurntableMethod()`：返回可对转台做进一步操作的方法集合（偏角、内外径、颜色等，以类型 `GlobalTurntableMethods` 为准）。

---

### 雷达格点与动画栅格（`radarLayer`）

依赖 **`@zip.js/zip.js`**（已在 peer 中声明）。数据一般为 **`.zip`**：内含一段长度前缀的 **UTF-8 JSON 头** + 二进制格点体（具体字段以解析结果 `header` 为准，常见含 `times`、`levels`、`xSize`、`ySize`、起止经纬度等）。

**类型说明**：包内有两套相近的 `GridHeader` 概念——ZIP 解析模块导出 **`GridHeader` / `GridFrame`**（头里可含 `flipLatitudeRowsForCesium`）；动画图层使用 **`AnimatedRasterLayerHeader` / `AnimatedGridFrame`**（头里可含 `timeList` 等）。向 `AnimatedRasterLayer.update` 传入的 `frame.header` 需与图层所需字段一致（通常与解析得到的地理范围、`xSize`/`ySize` 等对齐即可）。

#### 纬度行方向 `shouldFlipLatitudeRowsForCesium(header)`

根据 `yDelta`、`yStart`/`yEnd` 或显式 `flipLatitudeRowsForCesium`，判断格点行序是否应按 Cesium 纹理 **北向上** 的规则翻转，避免贴图南北镜像。`GridDataReader` 在生成 `getLevelSlice` 等结果时已应用该逻辑。

#### `GridDataReader`

-   **`readHeaderOnly(compressedFile: Blob)`**：只解析头，返回 `header`、`dataOffset`、`estimatedDataSize` 等。
-   **`readCompressedGridData(compressedFile: Blob)`**：完整解析；在支持 `Worker` 时优先走 `gridReader.worker`，否则主线程解压解析。成功时返回 `header` 与 **`getValue` / `getTimeSlice` / `getLevelSlice` / `getLatLonSlice`**（扁平或嵌套数据下均提供统一访问方式）。
-   静态调试（可选）：`GridDataReader.setDebugEnabled(true)` 开启解析过程日志
-   静态性能（可选）：`GridDataReader.setPerfEnabled(true)`、`resetPerfStats()`、`getPerfStats()`

#### 便捷函数

-   **`readGridHeaderFromFile(file)`** / **`readGridDataFromFile(file)`**：传入 `Blob`/`File`
-   **`readGridFromFileInput(file, readData?)`**：推荐；校验扩展名并在失败时 **throw**
-   **`handleFileUpload(event, readData?)`**：兼容旧 API，内部调用 `readGridFromFileInput`

#### `AnimatedRasterLayer(viewer, options?)`

将 **`AnimatedGridFrame`** 绘制为贴地/Primitive 栅格。

**实例方法（节选）**：`update(frame)`、`setColorRamp`、`setMaskPolygon`、`setGradientEnabled`、`setInteractionOptions`、`pickValue`、`destroy()`。

#### `HardEdgeRasterLayer(viewer, options?)`

硬边界模式：单瓦片 Canvas + 影像层，边界与数据严格对齐。使用 **`update(frame)`** 更新帧，**`destroy()`** 销毁。

---

### 全局事件 `useCesiumToolsManage()`

```ts
const bus = useCesiumToolsManage();
bus.addEventListener('myChannel', (e) => console.log(e.detail));
bus.dispatch('myChannel', { foo: 1 });
bus.removeEventListener('myChannel', handler);
```

与各工具内部的 `addToolsEventListener` 可并存；工具完成时通常派发字符串事件名 **`cesiumToolsFxt`**（见下节）。

---

### 工具完成事件 `cesiumToolsFxt`

多数工具在绘制/分析结束时会派发（具体以各工具 `dispatch` 为准），`ToolsEventTypeEnum` 中与包内工具相关的取值包括：

-   `lengthMeasurement`、`areaMeasurement`、`angleMeasurement`、`theHeightMeasurement`
-   `visualFieldAnalysis`、`visibilityAnalysis`
-   `slopDirectionAnalysis`
-   `turntableSwing`（枚举值为 `'theTurntableSwing'`）

示例：

```ts
measureDistance.addToolsEventListener('cesiumToolsFxt', (e) => {
    console.log(e.detail);
});
```

---

### 参数表（绘制，摘自类型定义）

#### `DrawingEntityOptions`（`drawingEntity.active`）

| 属性                                           | 类型              | 必填 | 说明     |
| ---------------------------------------------- | ----------------- | ---- | -------- |
| type                                           | `DrawingTypeEnum` | 是   | 绘制类型 |
| point / polyline / polygon / billboard / label | Entity 相关配置   | 否   | 样式     |

#### `CreatePrimitiveOptions`（`drawing.create`）

| 属性                                                            | 类型               | 必填 | 说明     |
| --------------------------------------------------------------- | ------------------ | ---- | -------- |
| type                                                            | `DrawingTypeEnum`  | 是   | 绘制类型 |
| point / polyline / polygon / polylinPolygon / billboard / label | Primitive 相关配置 | 否   | 样式     |

#### `EditPrimitiveOptions`（`drawing.edit`）

| 属性                                           | 类型              | 必填 | 说明     |
| ---------------------------------------------- | ----------------- | ---- | -------- |
| type                                           | `DrawingTypeEnum` | 否   | 绘制类型 |
| point / polyline / polygon / billboard / label | 集合或样式        | 否   | 编辑用   |

`CommonPrimitiveProps` 可包含 `showLabel?` 等扩展字段。

---

## 本地开发、测试与发布

以下命令均在 monorepo 根目录执行：

```bash
pnpm install
pnpm dev:cesium-tools
```

Playground 使用 Cesium ion 数据时，可在 `packages/common-utils/.env.local` 中配置：

```dotenv
VITE_CESIUM_ION_TOKEN=your_token
```

仓库中的 `playground/` 仅用于本地联调，不会进入 npm 包。样例数据说明位于 `public/resources/README.md`，缺失检查命令为：

```bash
pnpm --filter cesium-tools-fxt playground:check-data
```

单元测试覆盖不依赖 Cesium 画布的纯逻辑；Cesium 集成功能需在 Playground 手动验证：

```bash
pnpm --filter cesium-tools-fxt typecheck
pnpm --filter cesium-tools-fxt test
pnpm --filter cesium-tools-fxt build
```

发布前应同步更新 `package.json` 版本与 [`CHANGELOG.md`](CHANGELOG.md)。`prepublishOnly` 会依次执行 `typecheck`、`test` 和 `build`。建议先运行 `npm publish --dry-run` 核对最终文件清单，再由发布者执行 `npm publish`。

---

## 常见问题

1. **通视无红绿区域**：需地形参与阴影投射；确认 Cesium 版本不过旧，且 `setInstance` 在 `active` 之前调用。
2. **测量贴地标签悬空**：距离测量在 `clampToGround: true` 时已为标签设置贴地高度参考。
3. **`useMeasure` 第二个参数**：必须为 **`Cesium` 命名空间**（`import * as Cesium from 'cesium'`），与 Viewer 版本一致。

---

## 许可证

[MIT](./LICENSE)
