import React from 'react';
import * as Cesium from 'cesium';
import { useEffect } from 'react';

export default function Voxel({ viewer }: { viewer: Cesium.Viewer }) {
    const globalTransform = Cesium.Matrix4.fromScale(
        Cesium.Cartesian3.fromElements(
            Cesium.Ellipsoid.WGS84.maximumRadius,
            Cesium.Ellipsoid.WGS84.maximumRadius,
            Cesium.Ellipsoid.WGS84.maximumRadius
        )
    );

    useEffect(() => {
        if (viewer) {
            viewer.extend(Cesium.viewerVoxelInspectorMixin);
            viewer.scene.debugShowFramesPerSecond = true;
        }
    }, [viewer]);

    const getVoxel = async () => {
        const provider = await Cesium.Cesium3DTilesVoxelProvider.fromUrl(
            '/cesium/SampleData/Cesium3DTiles/Voxel/VoxelBox3DTiles/tileset.json'
        );
        createPrimitive(provider);
    };

    const customShaderColor = new Cesium.CustomShader({
        fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material)
        {
            material.diffuse = fsInput.metadata.a.rgb;
            material.alpha = fsInput.metadata.a.a;
        }`,
    });

    function createPrimitive(provider) {
        console.log(provider);
        viewer.scene.primitives.removeAll();

        const voxelPrimitive = viewer.scene.primitives.add(
            new Cesium.VoxelPrimitive({
                provider: provider,
                customShader: customShaderColor,
            })
        );

        voxelPrimitive.nearestSampling = true;

        viewer.voxelInspector.viewModel.voxelPrimitive = voxelPrimitive;
        viewer.camera.flyToBoundingSphere(voxelPrimitive.boundingSphere, {
            duration: 0.0,
        });

        return voxelPrimitive;
    }

    return (
        <div>
            <button onClick={getVoxel} style={{ position: 'absolute', top: 0, left: 0 }}>
                Voxel
            </button>
        </div>
    );
}
