// const size = 30;
export default `
    #version 300 es
    precision highp float;

    uniform sampler2D colorTexture;
    uniform sampler2D depthTexture;
    in vec2 v_textureCoordinates;
    uniform vec4 u_scanCenterEC;
    uniform vec3 u_scanPlaneNormalEC;
    uniform vec3 u_scanLineNormalEC;
    uniform float u_radius;
    uniform vec4 u_scanColor;
    uniform float u_rotationOffset;
    uniform float u_sectorSize;  // New uniform for sector size
    uniform float u_scanAngle;   // New uniform for scan angle
    out vec4 fragColor;

    //  将纹理坐标和深度值转换为眼坐标
    vec4 toEye(in vec2 uv, in float depth) {
        vec2 xy = vec2((uv.x * 2.0 - 1.0), (uv.y * 2.0 - 1.0));
        vec4 posInCamera = czm_inverseProjection * vec4(xy, depth, 1.0);
        posInCamera = posInCamera / posInCamera.w;
        return posInCamera;
    }

    // 将一个点投影到由法向量和原点定义的平面上
    vec3 pointProjectOnPlane(in vec3 planeNormal, in vec3 planeOrigin, in vec3 point) {
        vec3 v01 = point - planeOrigin;
        float d = dot(planeNormal, v01);
        return (point - planeNormal * d);
    }

    // 从深度纹理中提取深度值并将其转换为线性深度
    float getDepth(in vec4 depth) {
        float z_window = czm_unpackDepth(depth);
        z_window = czm_reverseLogDepth(z_window);
        float n_range = czm_depthRange.near;
        float f_range = czm_depthRange.far;
        return (2.0 * z_window - n_range - f_range) / (f_range - n_range);
    }

    void main() {
        vec4 color = texture(colorTexture, v_textureCoordinates);
        float depth = getDepth(texture(depthTexture, v_textureCoordinates));
        vec4 viewPos = toEye(v_textureCoordinates, depth);
        // 点投影到平面
        vec3 prjOnPlane = pointProjectOnPlane(u_scanPlaneNormalEC.xyz, u_scanCenterEC.xyz, viewPos.xyz);
        // 计算当前像素与扫描中心的距离
        float dis = length(prjOnPlane.xyz - u_scanCenterEC.xyz);

        // 计算当前像素与扫描中心的角度
        vec3 centerToPixel = normalize(prjOnPlane - u_scanCenterEC.xyz); // 描中心到当前像素的单位向量
        float angle = acos(dot(centerToPixel, u_scanLineNormalEC)); // 向量和扫描线法线 u_scanLineNormalEC 之间的夹角

        // 计算旋转偏移量
        float adjustedAngle = mod(angle - u_rotationOffset, 2.0 * 3.14159265359);

        float maxAngle = radians(u_sectorSize);

        // 扇形为 30 度
        // float maxAngle = radians(60.0);

        // 仅当像素在30度圆弧内时, 进行颜色混合
       if (dis < u_radius && adjustedAngle < maxAngle && adjustedAngle < radians(u_scanAngle)) {
            color = mix(color, u_scanColor, 0.3);
        }
        fragColor = color;
    }
`;
