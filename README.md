# cesium 工具

建议默认 cesium 版本为 ^1.119.0，node 版本为 18.18.2

## 工具测试

项目启动测试需要将 package.pro.json 文件改为 package.json 进行测试，因为测试的时候是使用react环境进行的测试。
如无特殊说明，工具所有结束操作均为鼠标右键结束操作。

## 发包注意

在发包前一定要检查 package.json 文件的依赖是否是工具包需要的，如果不对，一定是 package.json 和 package.prod.json 搞混了，重新命名即可。版本号需要修改
npm run build
npm publish

## 使用说明

开始：左键
结束：右键（如果无特殊说明均为右键结束）
距离测量、面积测量默认开启了实时计算功能，如果不开启，可设置 trendsComputed 为 false。 例：useXXX(XXX, { trendsComputed: false })

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
