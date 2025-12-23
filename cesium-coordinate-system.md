# Cesium 坐标系示意图

## 1. Cesium 局部坐标系（East-North-Up）

当使用 `Cesium.Transforms.eastNorthUpToFixedFrame(center)` 创建局部坐标系时：

```
                    ↑ North (Y轴正方向)
                    |
                    |
                    |
        West ←----- Center -----→ East (X轴正方向)
                    |
                    |
                    ↓
                 Down (Z轴负方向)
```

**说明：**

-   **X轴**：指向东方（East），对应经度增加方向
-   **Y轴**：指向北方（North），对应纬度增加方向
-   **Z轴**：指向上方（Up），对应高度增加方向

## 2. 体素数据维度映射

### 数据结构

```
data[time][level][y][x]
         ↓
    data[0][0] = [y][x] 二维数组
```

### 维度对应关系

```
数据数组维度：        Cesium体素维度：      地理方向：
─────────────────────────────────────────────────────
第一维 [y] (行)  →   dimensions.y (高度)  →  纬度方向 (North-South)
第二维 [x] (列)  →   dimensions.x (宽度)  →  经度方向 (East-West)
第三维 [z]       →   dimensions.z (深度)  →  高度方向 (Up-Down)
```

## 3. 地球上的坐标映射示意图

### 俯视图（从上方看地球）

```
                    North (纬度增加)
                    ↑
                    |
                    |
        ┌───────────┼───────────┐
        │           │           │
        │    [y=0]  │    [y=1]  │  ← 数据第一维（行）
        │    [x=0]  │    [x=1]   │
        │           │           │
West ←──┼───────────┼───────────┼──→ East (经度增加)
        │           │           │
        │    [y=2]  │    [y=3]  │
        │    [x=0]  │    [x=1]   │
        │           │           │
        └───────────┼───────────┘
                    │
                    ↓
                 South (纬度减少)
```

### 侧视图（从侧面看）

```
                    Up (Z轴正方向，高度)
                    ↑
                    │
                    │  [z=1]  ← 第三维（深度）
                    │
                    │  [z=0]  ← 地面层
                    │
        ┌───────────┼───────────┐
        │           │           │
        │    [y=0]  │    [y=1]  │  ← 第一维（行，纬度）
        │    [x=0]  │    [x=1]   │  ← 第二维（列，经度）
        │           │           │
        └───────────┼───────────┘
                    │
                    ↓
                 Down (Z轴负方向)
```

## 4. 实际渲染时的映射

### 在 renderVoex 方法中：

```typescript
// 地理边界
minLon = bounds.xStart; // 最小经度（West）
maxLon = bounds.xEnd; // 最大经度（East）
minLat = bounds.yStart; // 最小纬度（South）
maxLat = bounds.yEnd; // 最大纬度（North）

// 转换为Cesium局部坐标系
center = Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 0);
transform = Cesium.Transforms.eastNorthUpToFixedFrame(center);

// 体素边界（在局部坐标系中）
minBounds = new Cesium.Cartesian3(minX, minY, 0); // X=East, Y=North
maxBounds = new Cesium.Cartesian3(maxX, maxY, 1); // X=East, Y=North
```

### 映射关系表

| 数据维度 | 数组索引 | Cesium维度     | 地理方向         | 坐标轴      | 说明           |
| -------- | -------- | -------------- | ---------------- | ----------- | -------------- |
| 第一维   | `[y]`    | `dimensions.y` | 纬度 (Latitude)  | Y轴 (North) | 行数，从南到北 |
| 第二维   | `[x]`    | `dimensions.x` | 经度 (Longitude) | X轴 (East)  | 列数，从西到东 |
| 第三维   | `[z]`    | `dimensions.z` | 高度 (Height)    | Z轴 (Up)    | 深度，从下到上 |

## 5. 分块时的数据切片

### 原始数据 (253 x 253)

```
数据数组：[y][x]
行数(y) = 253 (纬度方向)
列数(x) = 253 (经度方向)
```

### 分块后 (titleSize = 128)

```
块布局 (2行 x 2列 = 4个块):

┌─────────────┬─────────────┐
│  块[0]      │  块[1]      │
│  y:0-127    │  y:0-127    │
│  x:0-127    │  x:128-253  │
├─────────────┼─────────────┤
│  块[2]      │  块[3]      │
│  y:128-253  │  y:128-253  │
│  x:0-127    │  x:128-253  │
└─────────────┴─────────────┘
```

### 每个块的维度

```
块[0]: dimensions = (128, 128, 1)
       - dimensions.x = 128 (经度方向，列数)
       - dimensions.y = 128 (纬度方向，行数)
       - dimensions.z = 1   (高度方向，深度)
```

## 6. 重要提示

⚠️ **关键理解：**

1. **数据数组的第一维（行）** = **纬度方向（North-South）** = **Cesium的Y轴**
2. **数据数组的第二维（列）** = **经度方向（East-West）** = **Cesium的X轴**
3. **Cesium的dimensions.x** 对应数据的**列数（经度方向）**，必须 ≤ 157
4. **Cesium的dimensions.y** 对应数据的**行数（纬度方向）**，理论上无限制

## 7. 代码中的对应关系

```typescript
// 数据维度
const actualYSize = resultData.length; // 第一维，行数，纬度方向
const actualXSize = resultData[0].length; // 第二维，列数，经度方向

// Cesium维度
this.dimensions = new Cesium.Cartesian3(
    clampedXSize, // X轴 = 经度方向 = 列数
    clampedYSize, // Y轴 = 纬度方向 = 行数
    1 // Z轴 = 高度方向
);

// 地理边界
minBounds = new Cesium.Cartesian3(minX, minY, 0);
//          └─经度─┘ └─纬度─┘ └高度┘
```
