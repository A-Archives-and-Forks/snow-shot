'use client';

import { useMemo } from 'react';

import { DrawCore } from '@/app/fullScreenDraw/components/drawCore';
import { DrawCacheLayerActionType } from './extra';
import { useRef, useImperativeHandle, useContext } from 'react';
import {
    DrawCoreActionType,
    DrawCoreContext,
    DrawCoreContextValue,
    ExcalidrawEventPublisher,
} from '@/app/fullScreenDraw/components/drawCore/extra';
import React from 'react';
import { useHistory } from '@/app/fullScreenDraw/components/drawCore/components/historyContext';
import { zIndexs } from '@/utils/zIndex';
import { DrawContext } from '../../types';
import { ElementRect } from '@/commands';
import { theme } from 'antd';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';

const DrawCacheLayerCore: React.FC<{
    actionRef: React.RefObject<DrawCacheLayerActionType | undefined>;
}> = ({ actionRef }) => {
    const { token } = theme.useToken();
    const drawCoreActionRef = useRef<DrawCoreActionType | undefined>(undefined);
    const { mousePositionRef } = useContext(DrawContext);
    const [, setExcalidrawEvent] = useStateSubscriber(ExcalidrawEventPublisher, undefined);

    const { history } = useHistory();
    useImperativeHandle(
        actionRef,
        () => ({
            setActiveTool: (...args) => {
                drawCoreActionRef.current?.setActiveTool(...args);
            },
            syncActionResult: (...args) => {
                drawCoreActionRef.current?.syncActionResult(...args);
            },
            updateScene: (...args) => {
                drawCoreActionRef.current?.updateScene(...args);
            },
            setEnable: (...args) => {
                drawCoreActionRef.current?.setEnable(...args);
            },
            onCaptureReady: async () => {
                drawCoreActionRef.current?.updateScene({
                    elements: [],
                });
                setExcalidrawEvent({
                    event: 'onDraw',
                    params: undefined,
                });
                setExcalidrawEvent(undefined);
            },
            onCaptureFinish: async () => {
                drawCoreActionRef.current?.setEnable(false);
                drawCoreActionRef.current?.setActiveTool({
                    type: 'hand',
                });
                drawCoreActionRef.current?.updateScene({
                    elements: [],
                    captureUpdate: 'IMMEDIATELY',
                });
                drawCoreActionRef.current?.getExcalidrawAPI()?.history.clear();
                history.clear();
            },
            getAppState: () => {
                return drawCoreActionRef.current?.getAppState();
            },
            getImageData: async (...args) => {
                return await drawCoreActionRef.current?.getImageData(...args);
            },
            getCanvasContext: () => {
                return drawCoreActionRef.current?.getCanvasContext();
            },
            getCanvas: () => {
                return drawCoreActionRef.current?.getCanvas();
            },
            getDrawCacheLayerElement: () => {
                return drawCoreActionRef.current?.getDrawCacheLayerElement();
            },
            getExcalidrawAPI: () => {
                return drawCoreActionRef.current?.getExcalidrawAPI();
            },
            handleWheel: (ev: WheelEvent | React.WheelEvent<HTMLDivElement>) => {
                drawCoreActionRef.current?.handleWheel(ev);
            },
        }),
        [history, setExcalidrawEvent],
    );

    const { selectLayerActionRef, imageBufferRef } = useContext(DrawContext);
    const drawCoreContextValue = useMemo<DrawCoreContextValue>(() => {
        return {
            getLimitRect: () => {
                return selectLayerActionRef.current?.getSelectRect();
            },
            getDevicePixelRatio: () => {
                return imageBufferRef.current?.monitorScaleFactor ?? window.devicePixelRatio;
            },
            getBaseOffset: (limitRect: ElementRect, devicePixelRatio: number) => {
                return {
                    x: limitRect.max_x / devicePixelRatio + token.marginXXS,
                    y: limitRect.min_y / devicePixelRatio,
                };
            },
            getAction: () => {
                return drawCoreActionRef.current;
            },
            getMousePosition: () => {
                return mousePositionRef.current;
            },
        };
    }, [imageBufferRef, selectLayerActionRef, token.marginXXS, mousePositionRef]);

    return (
        <DrawCoreContext.Provider value={drawCoreContextValue}>
            <DrawCore
                actionRef={drawCoreActionRef}
                zIndex={zIndexs.Draw_DrawCacheLayer}
                layoutMenuZIndex={zIndexs.Draw_ExcalidrawToolbar}
            />
        </DrawCoreContext.Provider>
    );
};

export const DrawCacheLayer = React.memo(DrawCacheLayerCore);
