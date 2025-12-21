import React, { useState } from 'react';
import * as Cesium from 'cesium';
import { useEffect } from 'react';
import CustomVoxel from '../tools/radarLayer/voxel';

export default function Voxel({ viewer }: { viewer: Cesium.Viewer }) {
    const dataURL = [
        'pythonfile/SX002/2025-08-09/SX002_20250809120000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809120500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809121000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809121500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809122000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809122500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809123000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809123500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809124000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809124500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809125000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809125500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809130000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809130500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809131000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809131500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809132000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809132500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809133000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809133500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809134000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809134500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809135000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809135500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809140000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809140500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809141000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809141500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809142000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809142500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809143000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809143500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809144000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809144500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809145000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809145500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809150000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809150500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809151000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809151500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809152000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809152500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809153000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809153500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809154000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809154500_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809155000_CR.zip',
        'pythonfile/SX002/2025-08-09/SX002_20250809155500_CR.zip',
    ];

    useEffect(() => {
        if (viewer) {
            setTimeout(() => {
                const voxel = new CustomVoxel(viewer);
                voxel.startRender();
            }, 500);
        }
    }, [viewer]);

    return (
        <div>
            <div
                id="pickedCoordinate"
                style={{ position: 'absolute', top: 100, left: 0, background: 'white' }}
            ></div>
        </div>
    );
}
