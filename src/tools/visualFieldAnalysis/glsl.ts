export default `
#define USE_CUBE_MAP_SHADOW true
precision highp float;

uniform sampler2D colorTexture;
uniform sampler2D depthTexture;
in vec2 v_textureCoordinates;
uniform mat4 camera_projection_matrix;
uniform mat4 camera_view_matrix;
uniform samplerCube shadowMap_textureCube;
uniform mat4 shadowMap_matrix;
uniform vec4 shadowMap_lightPositionEC;
uniform vec4 shadowMap_normalOffsetScaleDistanceMaxDistanceAndDarkness;
uniform vec4 shadowMap_texelSizeDepthBiasAndNormalShadingSmooth;
uniform float helsing_viewDistance;
uniform vec4 helsing_visibleAreaColor;
uniform vec4 helsing_invisibleAreaColor;

out vec4 fragColor;

vec4 toEye(in vec2 uv, in float depth) {
    vec2 xy = vec2((uv.x * 2. - 1.), (uv.y * 2. - 1.));
    vec4 posInCamera = czm_inverseProjection * vec4(xy, depth, 1.);
    posInCamera = posInCamera / posInCamera.w;
    return posInCamera;
}

vec3 pointProjectOnPlane(in vec3 planeNormal, in vec3 planeOrigin, in vec3 point) {
    vec3 v01 = point - planeOrigin;
    float d = dot(planeNormal, v01);
    return (point - planeNormal * d);
}

// 从深度纹理中采样得到深度设值解码和转化
float getDepth(in vec4 depth) {
    float z_window = czm_unpackDepth(depth);
    z_window = czm_reverseLogDepth(z_window);
    float n_range = czm_depthRange.near;
    float f_range = czm_depthRange.far;
    return (2. * z_window - n_range - f_range) / (f_range - n_range);
}

// 仅用深度比较，不用 czm_private_shadowVisibility（会对比较结果做随参数变化的柔化，视角微动时易抖）
float shadow(in vec4 positionEC) {
    vec3 directionEC = positionEC.xyz - shadowMap_lightPositionEC.xyz;
    float distance = length(directionEC);
    directionEC = normalize(directionEC);
    float radius = shadowMap_lightPositionEC.w;
    if (distance > radius) {
        return 2.0;
    }
    vec3 directionWC = czm_inverseViewRotation * directionEC;
    float depthBias = shadowMap_texelSizeDepthBiasAndNormalShadingSmooth.z;
    float depthToCompare = distance / radius - 0.0003 - depthBias;
    return czm_shadowDepthCompare(shadowMap_textureCube, directionWC, depthToCompare);
}

bool visible(in vec4 result) {
    result.x /= result.w;
    result.y /= result.w;
    result.z /= result.w;
    return result.x >= -1. && result.x <= 1. &&
           result.y >= -1. && result.y <= 1. &&
           result.z >= -1. && result.z <= 1.;
}

void main() {

    fragColor = texture(colorTexture, v_textureCoordinates);  // 提取当前片段的颜色 这里是透明色
    float depth = getDepth(texture(depthTexture, v_textureCoordinates)); // 获取深度值
    vec4 viewPos = toEye(v_textureCoordinates, depth); // 将当前片段的深度值转换为眼睛坐标系中的位置
    vec4 worldPos = czm_inverseView * viewPos;  // 将片段的眼睛坐标系位置转换为世界坐标系位置
    vec4 vcPos = camera_view_matrix * worldPos; // 世界坐标系位置转换为摄像机坐标系（视图坐标系）位置
    float near = .001 * helsing_viewDistance; // 计算视锥体的近裁剪面的距离
    float dis = length(vcPos.xyz); // 计算的是片段从摄像机位置的距离

    if(dis > near && dis < helsing_viewDistance) {
        vec4 posInEye = camera_projection_matrix * vcPos; // 确定该片段是否在视锥体内
        if(visible(posInEye)) {
            float vis = shadow(viewPos);
            // vis==2：超出点光源半径，不染色；否则按硬比较 0/1（略放宽避免浮点贴边）
            if (vis <= 1.0) {
                if (vis >= 0.5) {
                    fragColor = mix(fragColor, helsing_visibleAreaColor, .5);
                } else {
                    fragColor = mix(fragColor, helsing_invisibleAreaColor, .5);
                }
            }
        }
    }
}

`;
