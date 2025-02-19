# [cesium 工具](https://www.npmjs.com/package/cesium-tools-fxt)

建议默认 cesium 版本为 ^1.119.0，node 版本为 ^18.18.2

目前测量功能已做向下兼容，其他工具暂未做向下兼容

## 安装

```bash
# or pnpm or yarn
npm install cesium-tools-fxt
```

## 工具测试

项目启动测试需要将 package.pro.json 文件改为 package.json 进行测试，因为测试的时候是使用react环境进行的测试。

如需在其他项目中测试包内工具，使用 npm link 发布到本地，测试项目使用 npm link cesium-tools-fxt 引入包

如无特殊说明，工具所有结束操作均为鼠标右键结束操作。

## 发包注意

在发包前一定要检查 package.json 文件的依赖是否是工具包需要的，如果不对，一定是 package.json 和 package.prod.json 搞混了，重新命名即可。版本号需要修改

建议安装 npm install -g npm-version-bump 插件，实现一键更新版本号，[major.minor.patch]

`npm version [major]`

`npm version [minor]`

`npm version [patch]`

`npm run build`

`npm publish`

## 使用说明

开始：左键

结束：右键（如果无特殊说明均为右键结束）

### 绘制功能使用说明

```
const drawing = useDrawing(
    measure as Cesium.Viewer
);

// 绘制
drawing.active(options)

// 保存
drawing.create(id, position, options)

// 编辑
drawing.edit(id, viewer, options)
```

#### options 参数说明

#### DrawingEntityOptions (active方法参数)

| 属性      | 类型                             | 必填 | 说明           |
| --------- | -------------------------------- | ---- | -------------- |
| type      | DrawingTypeEnum                  | 是   | 绘制类型       |
| point     | any                              | 否   | 点样式配置     |
| polyline  | Cesium.Entity.ConstructorOptions | 否   | 线样式配置     |
| polygon   | Cesium.Entity.ConstructorOptions | 否   | 面样式配置     |
| billboard | Cesium.Entity.ConstructorOptions | 否   | 广告牌样式配置 |
| label     | Cesium.Entity.ConstructorOptions | 否   | 标签样式配置   |

#### CreatePrimitiveOptions (create方法参数)

| 属性           | 类型                                                                                           | 必填 | 说明                   |
| -------------- | ---------------------------------------------------------------------------------------------- | ---- | ---------------------- |
| type           | DrawingTypeEnum                                                                                | 是   | 绘制类型               |
| point          | Cesium.PointPrimitiveCollection & CommonPrimitiveProps                                         | 否   | 点集合样式配置         |
| polyline       | Cesium.GroundPolylineGeometry & CommonPrimitiveProps 或 {width?: number; color?: Cesium.Color} | 否   | 线样式配置             |
| polygon        | Cesium.PolygonGeometry & CommonPrimitiveProps 或 {color?: Cesium.Color}                        | 否   | 面样式配置             |
| polylinPolygon | CommonPrimitiveProps                                                                           | 否   | 线面同时绘制的样式配置 |
| billboard      | Cesium.BillboardCollection & CommonPrimitiveProps                                              | 否   | 广告牌集合样式配置     |
| label          | Cesium.LabelCollection                                                                         | 否   | 标签集合样式配置       |

#### EditPrimitiveOptions (edit方法参数)

| 属性      | 类型                                   | 必填 | 说明               |
| --------- | -------------------------------------- | ---- | ------------------ |
| type      | DrawingTypeEnum                        | 否   | 绘制类型           |
| point     | Cesium.PointPrimitiveCollection        | 否   | 点集合样式配置     |
| polyline  | {width?: number; color?: Cesium.Color} | 否   | 线样式配置         |
| polygon   | {color?: Cesium.Color}                 | 否   | 面样式配置         |
| billboard | Cesium.BillboardCollection             | 否   | 广告牌集合样式配置 |
| label     | Cesium.LabelCollection                 | 否   | 标签集合样式配置   |

注: CommonPrimitiveProps 包含 showLabel?: boolean 属性

### 测量基础功能使用说明

```
const { measureDistance, measureArea, measureAngle, measureTheHeightOfTheGround } = useMeasure(
    measure as Cesium.Viewer,
    { trendsComputed: true }
);

// 例如使用测量距离，其他同理
measureDistance().active() // 开始
measureDistance().deactivate() // 注销
measureDistance().clear() // 清除图层
measureDistance().addToolsEventListener() // 监听事件
measureDistance().removeToolsEventListener() // 移除事件
```

### 其他工具基础功能使用说明

```
// 坡向分析使用，通视、透视、模拟转台同理
const { active, clear, deactivate, setInstance, addToolsEventListener, removeToolsEventListener } = useSlopeDirectionAnalysis();
setInstance() // 设置实例 即 viewer
active() // 开始
deactivate() // 注销
clear() // 清除图层
addToolsEventListener() // 监听事件
removeToolsEventListener() // 移除事件
```

### 实时计算

距离测量、面积测量默认开启了实时计算功能，如果不开启，可设置 trendsComputed 为 false。 例：useXXX(XXX, { trendsComputed: false })

监听：

每一个工具方法会抛出 addToolsEventListener、removeToolsEventListener 进行监听和移除监听，绘制完成后会发送 'cesiumToolsFxt' 事件。

## 视域分析

特殊说明：在低版本 cesium 中可能存在无法运行的问题

## 通视分析

特殊说明：左键第二次点击即为结束

## 坡向分析

特殊说明：在低版本 cesium 中可能存在无法运行的问题

## 转台分析

特殊说明：左键点击后即结束

## 测量工具

距离测量、折现测量、面积测量、角度测量、地表高度测量

## 绘制工具

点、线、面、广告牌、标签

特殊说明：绘制面的时候，如果绘制多边形，需要至少绘制两个点，否则无法绘制面
