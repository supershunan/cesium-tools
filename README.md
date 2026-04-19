# [cesium-tools-fxt](https://www.npmjs.com/package/cesium-tools-fxt)

Cesium 场景常用工具集合：测量、绘制、通视/视域、坡向、转台模拟等。

- 建议 **Cesium**：`^1.119.0`（开发依赖已对齐较新版本，请以 peer 为准）
- 建议 **Node**：`^18.18.2` 或更高

测量相关 API 已做较多兼容与增强；其它工具建议与当前 Cesium 主版本一起升级验证。

---

## 安装

```bash
npm install cesium-tools-fxt
```

以下由 **peerDependencies** 声明，需在业务工程中一并安装（npm 7+ 常会随本包自动安装；缺失时请手动安装）：

`react`、`react-dom`、`cesium`、`@turf/turf`、`@zip.js/zip.js`、`d3-delaunay`

示例：

```bash
npm install cesium-tools-fxt react react-dom cesium @turf/turf @zip.js/zip.js d3-delaunay
```

---

## 本地开发与联调

在本仓库根目录执行 `npm install` 后运行 `npm run dev`（peer 包已在 devDependencies 中供本地解析）。

在其它项目中联调本包：`npm link`（在本仓库） + `npm link cesium-tools-fxt`（在业务项目）。

---

## 发包注意

发包前确认 `peerDependencies` 与宿主一致；版本号按需修改。未打进 `dist` 的依赖由 `vite.config.ts` 的 `build.rollupOptions.external` 控制，与 `package.json` 的 peer 声明保持一致。

构建与发布示例：

```bash
npm version patch   # 或 major / minor
npm run build
npm publish
```

---

## 快速开始（React 示例）

```tsx
import * as Cesium from 'cesium';
import {
  useMeasure,
  useDrawing,
  useVisualFieldAnalysis,
  useVisibilityAnalysis,
  useSlopeDirectionAnalysis,
  useTurntableSwing,
  useCesiumToolsManage,
} from 'cesium-tools-fxt';

function MapTools({ viewer }: { viewer: Cesium.Viewer }) {
  const { measureDistance, measureArea, measureAngle, measureTheHeightOfTheGround } = useMeasure(
    viewer,
    Cesium
  );
  const { drawing, drawingEntity } = useDrawing(viewer, Cesium);
  const visualFieldAnalysis = useVisualFieldAnalysis();
  const visibilityAnalysis = useVisibilityAnalysis();
  const slopeDirectionAnalysis = useSlopeDirectionAnalysis();
  const turntableSwing = useTurntableSwing();

  useEffect(() => {
    visualFieldAnalysis.setInstance(viewer);
    visibilityAnalysis.setInstance(viewer);
    slopeDirectionAnalysis.setInstance(viewer);
    turntableSwing.setInstance(viewer);
  }, [viewer]);

  return null;
}
```

**约定**：除下文单独说明外，多数交互工具为 **左键** 选点/绘制，**右键** 结束当前操作。

---

## 从包入口导出的 API

`import { … } from 'cesium-tools-fxt'` 包含：

| 导出 | 说明 |
|------|------|
| `useMeasure` | 距离、面积、角度、地表高度测量 |
| `useDrawing` | 图元绘制 + Entity 绘制（两套 API） |
| `useVisualFieldAnalysis` | 通视分析（视锥 + 阴影后处理） |
| `useVisibilityAnalysis` | 视域/透视分析 |
| `useSlopeDirectionAnalysis` | 坡向分析（区域网格） |
| `useTurntableSwing` | 模拟雷达转台 |
| `useCesiumToolsManage` | 全局事件派发/监听（与单工具事件可配合使用） |
| `GridDataReader` | 雷达/格点 ZIP 解压与解析（可选 Worker） |
| `readGridHeaderFromFile` | 仅从 ZIP 读取 JSON 头与元信息 |
| `readGridDataFromFile` | 读取完整格点数据（含访问器） |
| `handleFileUpload` | `<input type="file">` 便捷封装（`.zip`） |
| `shouldFlipLatitudeRowsForCesium` | 是否按 Cesium 贴图方向翻转纬度行 |
| `AnimatedRasterLayer` | 将二维格点着色为场景贴地/Primitive 或硬边界影像层 |

类型：`Measure`、`MeasurementActions`、`DrawingActions`、`VisualFieldAnalysis`、`VisibilityAnalysisProps`、`SlopDerectionAnalysis`、`TurntableSwingProps`、`DrawingTypeEnum`、`Points`；格点侧另有 `GridHeader`、`GridFrame`、`AnimatedRasterLayerHeader`、`AnimatedGridFrame`、`AnimatedGridCellInfo`、`DynamicRasterInteractionOptions`、`RasterColorStop`、`PolygonMaskCoord`、`AnimatedRasterLayerOptions` 等（见下节）。

---

## 测量 `useMeasure(viewer, Cesium)`

```ts
const {
  measureDistance,
  measureArea,
  measureAngle,
  measureTheHeightOfTheGround,
} = useMeasure(viewer, Cesium);
```

每个子工具均提供：

- `active(options?)`：开始测量
- `deactivate()`：注销交互（会销毁内部 `ScreenSpaceEventHandler`）
- `clear()`：清除当前工具产生的实体与标注
- `addToolsEventListener(eventName, callback)` / `removeToolsEventListener(eventName, callback?)`：监听自定义事件（见下文「事件」）

### 鼠标操作

| 工具 | 操作说明 |
|------|----------|
| **距离** `measureDistance` | **左键** 依次加点折线；**右键** 结束当前折线段并开始下一段（若继续测量） |
| **面积** `measureArea` | **左键** 加顶点；**右键** 闭合并完成当前多边形 |
| **角度** `measureAngle` | **左键** 加折线顶点（第三点起显示夹角）；**右键** 结束（至少 3 点） |
| **地表高度** `measureTheHeightOfTheGround` | **左键** 拾取一点并显示高度；**右键** 结束工具 |

### 常用选项摘要

**距离** `LengthActiveOptions`：

- `clampToGround?`：是否贴地测距（贴地时使用地形/椭球相关距离）
- `liveUpdateOnMove?`：默认等价 `true`；设为 `false` 则移动鼠标时不更新距离标签，仅预览折线
- `line?`：`LabelOptions`（`template`、`customRender`、`font`、颜色、`heightReference` 贴地标签等）

**面积** `AreaActiveOptions`：

- `clampToGround?`、`liveUpdateOnMove?`
- `area?`：标签与 `customRender(area2d, area3d)`（平方米）

**角度** `AngleActiveOptions`：

- `clampToGround?`、`liveUpdateOnMove?`
- `distance?`：边长标签样式
- `angle?`：角度标签样式

**高度** `TheHeightOfTheGroundActiveOptions`：

- `clampToGround`（必填）
- `height?`：标签样式

**标签 `LabelOptions`（节选）**：

- `customRender?(value1: number, value2?: number): string`：自定义文案（距离/面积/角度含义见类型注释）
- `template?`：占位 `{}` 替换数字字符串；面积模板可按顺序替换 **两个** `{}`（平面、测地）
- `show?`：默认显示；`false` 隐藏标签

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

## 绘制 `useDrawing(viewer, Cesium)`

返回 **`drawing`**（Primitive 路线）与 **`drawingEntity`**（Entity 路线），接口形状相同：

- `active(options?)`：进入绘制
- `deactivate()` / `clear()`
- `create(id, positions, options)`：用已有坐标生成图形
- `edit(id, viewer, options)`：编辑
- `addToolsEventListener` / `removeToolsEventListener`

`DrawingTypeEnum` 当前包含：`point`、`billboard`、`face`（具体以类型定义为准）。

绘制 **面** 时，多边形至少需要 **两个** 已选点后再右键结束，否则无法成面（与实现一致）。

---

## 通视分析 `useVisualFieldAnalysis()`

基于观测点、目标方向与视锥，在场景上叠加 **可见/不可见** 颜色（后处理 + 阴影贴图）。建议在 **3D**、有地形且开启深度时效果更稳定。

### 初始化

```ts
const visualFieldAnalysis = useVisualFieldAnalysis();
visualFieldAnalysis.setInstance(viewer);
```

### 鼠标操作

- **第一次左键**：观测点（起点）
- **移动鼠标**：预览视锥与通视
- **第二次左键**：目标点（结束本次分析并固定结果）

（两次均为 **左键**，不是右键。）

### API

- `active(options?)`：`options` 可选，为 `{ startText?, endText? }`，用于提示文案
- `deactivate()` / `clear()`
- `getInstance()`：内部 `ViewShed` 实例（高级用法）
- `setViewShedOptions(options)`：`ViewShedOptionalOptions`（水平/垂直角、颜色、`softShadows`、`size` 等，不含观测坐标）
- `cleanInstance()`：销毁内部 handler 并清空引用（切换 Viewer 前建议调用）

### 环境与性能说明

- 分析期间会临时修改 `Globe.shadows`、`viewer.shadows`、`depthTestAgainstTerrain` 等，结束后在 `clear` / `ViewShed.clear` 中会恢复。
- 若使用 **3D Tiles**，需让模型参与阴影（例如 `tileset.shadows = Cesium.ShadowMode.ENABLED`），否则遮挡可能不完整。

---

## 视域/透视分析 `useVisibilityAnalysis()`

```ts
const visibilityAnalysis = useVisibilityAnalysis();
visibilityAnalysis.setInstance(viewer);
visibilityAnalysis.active();
```

### 鼠标操作

- **第一次左键**：起点
- **移动鼠标**：预览
- **第二次左键**：终点并完成

提供 `deactivate`、`clear`、`getInstance`、`cleanInstance`、事件监听，形态与通视类似（无 `setViewShedOptions`）。

---

## 坡向分析 `useSlopeDirectionAnalysis()`

```ts
const slope = useSlopeDirectionAnalysis();
slope.setInstance(viewer);
slope.setDistance(30); // 可选，网格粒度，单位 km，最小 20
slope.active();
```

### 鼠标操作

- **左键**：依次添加区域顶点并预览多边形
- **右键**：闭合区域（至少 **3** 个点）并执行分析

`setDistance(km)`：小于 `20` 会抛错。

---

## 模拟雷达转台 `useTurntableSwing()`

```ts
const turntable = useTurntableSwing();
turntable.setInstance(viewer);
turntable.active();
```

### 鼠标操作

- **左键一次**：在点击位置创建转台并完成交互

`globalTurntableMethod()`：返回可对转台做进一步操作的方法集合（偏角、内外径、颜色等，以类型 `GlobalTurntableMethods` 为准）。

---

## 雷达格点与动画栅格（`radarLayer`）

依赖 **`@zip.js/zip.js`**（已在 peer 中声明）。数据一般为 **`.zip`**：内含一段长度前缀的 **UTF-8 JSON 头** + 二进制格点体（具体字段以解析结果 `header` 为准，常见含 `times`、`levels`、`xSize`、`ySize`、起止经纬度等）。

**类型说明**：包内有两套相近的 `GridHeader` 概念——ZIP 解析模块导出 **`GridHeader` / `GridFrame`**（头里可含 `flipLatitudeRowsForCesium`）；动画图层使用 **`AnimatedRasterLayerHeader` / `AnimatedGridFrame`**（头里可含 `timeList` 等）。向 `AnimatedRasterLayer.update` 传入的 `frame.header` 需与图层所需字段一致（通常与解析得到的地理范围、`xSize`/`ySize` 等对齐即可）。

### 纬度行方向 `shouldFlipLatitudeRowsForCesium(header)`

根据 `yDelta`、`yStart`/`yEnd` 或显式 `flipLatitudeRowsForCesium`，判断格点行序是否应按 Cesium 纹理 **北向上** 的规则翻转，避免贴图南北镜像。`GridDataReader` 在生成 `getLevelSlice` 等结果时已应用该逻辑。

### `GridDataReader`

- **`readHeaderOnly(compressedFile: Blob)`**：只解析头，返回 `header`、`dataOffset`、`estimatedDataSize` 等。
- **`readCompressedGridData(compressedFile: Blob)`**：完整解析；在支持 `Worker` 时优先走 `gridReader.worker`，否则主线程解压解析。成功时返回 `header` 与 **`getValue` / `getTimeSlice` / `getLevelSlice` / `getLatLonSlice`**（扁平或嵌套数据下均提供统一访问方式）。
- 静态性能（可选）：`GridDataReader.setPerfEnabled(true)`、`resetPerfStats()`、`getPerfStats()`。

### 便捷函数

- **`readGridHeaderFromFile(file)`**：对上传的 `File` 调用 `readHeaderOnly`（内部 `console` 会打印概要）。
- **`readGridDataFromFile(file)`**：完整读取。
- **`handleFileUpload(event, readData?)`**：从 `event.target.files[0]` 取 `.zip`；`readData === true` 时读全量，否则只读头（失败时 `alert`）。

### `AnimatedRasterLayer(viewer, options?)`

将 **`AnimatedGridFrame`**（`header` + 二维 `grid` 数值，可选 `heightMeters`、`opacity`、`skipRequestRender`）绘制为栅格着色层。

**构造选项 `AnimatedRasterLayerOptions`**（节选）：`clampToGround`、`gradientEnabled`、`colorRamp`（`RasterColorStop[]`）、`interactionOptions`（悬停高亮、`onCellHover` / `onCellClick`）、`maskPolygon`（`[lon, lat][]` 多边形外裁剪）。

**实例方法**：

| 方法 | 说明 |
|------|------|
| `update(frame)` | 更新贴地/Primitive 路线下的栅格与颜色 |
| `updateHardEdge(frame)` | **硬边界**模式：单瓦片 Canvas 影像 + 纹理直传，适合边界与数据严格对齐 |
| `setColorRamp(stops?)` | 调整色带 |
| `setMaskPolygon(coords \| null)` | 多边形遮罩 |
| `setGradientEnabled(enabled)` | 是否渐变填色 |
| `setInteractionOptions(options)` | 交互与高亮 |
| `pickValue(longitude, latitude)` | 按经纬度取当前格网值（无效返回 `null`） |
| `destroy()` | 销毁默认渲染路径与监听 |
| `destroyHardEdge()` | 销毁硬边界影像层及相关状态 |

---

## 全局事件 `useCesiumToolsManage()`

```ts
const bus = useCesiumToolsManage();
bus.addEventListener('myChannel', (e) => console.log(e.detail));
bus.dispatch('myChannel', { foo: 1 });
bus.removeEventListener('myChannel', handler);
```

与各工具内部的 `addToolsEventListener` 可并存；工具完成时通常派发字符串事件名 **`cesiumToolsFxt`**（见下节）。

---

## 工具完成事件 `cesiumToolsFxt`

多数工具在绘制/分析结束时会派发（具体以各工具 `dispatch` 为准），`ToolsEventTypeEnum` 中与包内工具相关的取值包括：

- `lengthMeasurement`、`areaMeasurement`、`angleMeasurement`、`theHeightMeasurement`
- `visualFieldAnalysis`、`visibilityAnalysis`
- `slopDirectionAnalysis`
- `turntableSwing`（枚举值为 `'theTurntableSwing'`）

示例：

```ts
measureDistance.addToolsEventListener('cesiumToolsFxt', (e) => {
  console.log(e.detail);
});
```

---

## 仓库内其它模块（按需路径引入）

以下模块未从包主入口 `export`，若在 monorepo 或源码中引用，请使用项目内别名或相对路径（以实际 `tsconfig` / 打包配置为准）：

- `earthProjection`：投影相关工具

---

## 参数表（绘制，摘自类型定义）

### `DrawingEntityOptions`（`drawingEntity.active`）

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | `DrawingTypeEnum` | 是 | 绘制类型 |
| point / polyline / polygon / billboard / label | Entity 相关配置 | 否 | 样式 |

### `CreatePrimitiveOptions`（`drawing.create`）

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | `DrawingTypeEnum` | 是 | 绘制类型 |
| point / polyline / polygon / polylinPolygon / billboard / label | Primitive 相关配置 | 否 | 样式 |

### `EditPrimitiveOptions`（`drawing.edit`）

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | `DrawingTypeEnum` | 否 | 绘制类型 |
| point / polyline / polygon / billboard / label | 集合或样式 | 否 | 编辑用 |

`CommonPrimitiveProps` 可包含 `showLabel?` 等扩展字段。

---

## 常见问题

1. **通视无红绿区域**：需地形参与阴影投射；确认 Cesium 版本不过旧，且 `setInstance` 在 `active` 之前调用。
2. **测量贴地标签悬空**：距离测量在 `clampToGround: true` 时已为标签设置贴地高度参考。
3. **`useMeasure` 第二个参数**：必须为 **`Cesium` 命名空间**（`import * as Cesium from 'cesium'`），与 Viewer 版本一致。

---

## 许可证

以仓库内 `package.json` / 仓库声明为准。
