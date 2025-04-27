'use client';

import { captureCurrentMonitor, ImageBuffer, ImageEncoder } from '@/commands';
import { EventListenerContext } from '@/components/eventListener';
import React, { useMemo, useState } from 'react';
import { useCallback, useContext, useEffect, useRef } from 'react';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import * as PIXI from 'pixi.js';
import { CanvasLayer, CaptureStep, DrawContext, DrawContextType, DrawState } from './types';
import SelectLayer, { SelectLayerActionType } from './components/selectLayer';
import DrawLayer, { DrawLayerActionType } from './components/drawLayer';
import { Window as AppWindow, getCurrentWindow } from '@tauri-apps/api/window';
import {
    CaptureLoadingPublisher,
    DrawStatePublisher,
    CaptureStepPublisher,
    switchLayer,
    CaptureEventPublisher,
    CaptureEvent,
} from './extra';
import { DrawToolbar, DrawToolbarActionType } from './components/drawToolbar';
import { BaseLayerEventActionType } from './components/baseLayer';
import { ColorPicker } from './components/colorPicker';
import { HistoryContext, withCanvasHistory } from './components/historyContext';
import { withStatePublisher } from '@/hooks/useStatePublisher';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import StatusBar from './components/statusBar';
import { MousePosition } from '@/utils/mousePosition';
import { EnableKeyEventPublisher } from './components/drawToolbar/components/keyEventWrap/extra';
import { zIndexs } from '@/utils/zIndex';
import styles from './page.module.css';
import dynamic from 'next/dynamic';
import {
    DrawCacheLayerActionType,
    ExcalidrawOnChangePublisher,
    ExcalidrawOnHandleEraserPublisher,
} from './components/drawCacheLayer/extra';
import { copyToClipboard, fixedToScreen, handleOcrDetect, saveToFile } from './actions';
import { FixedImage, FixedImageActionType } from './components/fixedImage';
import { OcrBlocks, OcrBlocksActionType } from './components/ocrBlocks';

const DrawCacheLayer = dynamic(
    async () => (await import('./components/drawCacheLayer')).DrawCacheLayer,
    {
        ssr: false,
    },
);

const DrawPageCore: React.FC = () => {
    const appWindowRef = useRef<AppWindow>(undefined as unknown as AppWindow);
    useEffect(() => {
        appWindowRef.current = getCurrentWindow();
    }, []);

    // 截图原始数据
    const imageBufferRef = useRef<ImageBuffer | undefined>(undefined);
    const imageBlobUrlRef = useRef<string | undefined>(undefined);
    const { addListener, removeListener } = useContext(EventListenerContext);

    // 层级
    const layerContainerRef = useRef<HTMLDivElement>(null);
    const drawLayerActionRef = useRef<DrawLayerActionType | undefined>(undefined);
    const drawCacheLayerActionRef = useRef<DrawCacheLayerActionType | undefined>(undefined);
    const selectLayerActionRef = useRef<SelectLayerActionType | undefined>(undefined);
    const drawToolbarActionRef = useRef<DrawToolbarActionType | undefined>(undefined);
    const [isFixed, setIsFixed] = useState(false);
    const fixedImageActionRef = useRef<FixedImageActionType | undefined>(undefined);
    const ocrBlocksActionRef = useRef<OcrBlocksActionType | undefined>(undefined);

    // 状态
    const mousePositionRef = useRef<MousePosition>(new MousePosition(0, 0));
    const [getCaptureStep, setCaptureStep, resetCaptureStep] = useStateSubscriber(
        CaptureStepPublisher,
        undefined,
    );
    const [getDrawState, , resetDrawState] = useStateSubscriber(DrawStatePublisher, undefined);
    const [, setCaptureLoading] = useStateSubscriber(CaptureLoadingPublisher, undefined);
    const [, setCaptureEvent] = useStateSubscriber(CaptureEventPublisher, undefined);
    const onCaptureLoad = useCallback<BaseLayerEventActionType['onCaptureLoad']>(
        async (texture: PIXI.Texture, imageBuffer: ImageBuffer) => {
            await Promise.all([
                drawLayerActionRef.current?.onCaptureLoad(texture, imageBuffer),
                selectLayerActionRef.current?.onCaptureLoad(texture, imageBuffer),
            ]);

            setCaptureEvent({
                event: CaptureEvent.onCaptureLoad,
                params: [texture, imageBuffer],
            });
        },
        [setCaptureEvent],
    );
    const capturingRef = useRef(false);
    const { history } = useContext(HistoryContext);
    const circleCursorRef = useRef<HTMLDivElement>(null);

    const handleLayerSwitch = useCallback((layer: CanvasLayer) => {
        switchLayer(layer, drawLayerActionRef.current, selectLayerActionRef.current);
    }, []);
    const onCaptureStepDrawStateChange = useCallback(() => {
        const captureStep = getCaptureStep();
        const drawState = getDrawState();

        if (captureStep === CaptureStep.Select) {
            handleLayerSwitch(CanvasLayer.Select);
            return;
        } else if (captureStep === CaptureStep.Draw) {
            if (drawState === DrawState.Idle) {
                handleLayerSwitch(CanvasLayer.Select);
                drawCacheLayerActionRef.current?.setEnable(false);
                return;
            }

            handleLayerSwitch(CanvasLayer.Draw);
            return;
        }

        handleLayerSwitch(CanvasLayer.Select);
    }, [getCaptureStep, getDrawState, handleLayerSwitch]);
    useStateSubscriber(CaptureStepPublisher, onCaptureStepDrawStateChange);
    useStateSubscriber(DrawStatePublisher, onCaptureStepDrawStateChange);

    /** 截图准备 */
    const readyCapture = useCallback(
        async (imageBuffer: ImageBuffer) => {
            capturingRef.current = true;
            setCaptureLoading(true);
            drawToolbarActionRef.current?.setEnable(false);

            if (imageBlobUrlRef.current) {
                const tempUrl = imageBlobUrlRef.current;
                // 延迟释放 URL，提速
                setTimeout(() => {
                    URL.revokeObjectURL(tempUrl);
                }, 0);
            }

            imageBlobUrlRef.current = URL.createObjectURL(new Blob([imageBuffer.data]));
            const imageTexture = await PIXI.Assets.load<PIXI.Texture>({
                src: imageBlobUrlRef.current,
                loadParser: 'loadTextures',
            });
            mousePositionRef.current = new MousePosition(
                Math.floor(imageBuffer.mouseX / imageBuffer.monitorScaleFactor),
                Math.floor(imageBuffer.mouseY / imageBuffer.monitorScaleFactor),
            );

            await Promise.all([
                drawLayerActionRef.current?.onCaptureReady(imageTexture, imageBuffer),
                selectLayerActionRef.current?.onCaptureReady(imageTexture, imageBuffer),
                drawCacheLayerActionRef.current?.onCaptureReady(),
            ]);
            setCaptureEvent({
                event: CaptureEvent.onCaptureReady,
                params: [imageTexture, imageBuffer],
            });
            setCaptureLoading(false);

            onCaptureLoad(imageTexture, imageBuffer);
        },
        [onCaptureLoad, setCaptureLoading, setCaptureEvent],
    );

    /** 显示截图窗口 */
    const showWindow = useCallback(async (imageBuffer: ImageBuffer) => {
        const appWindow = appWindowRef.current;

        const { monitorX, monitorY } = imageBuffer;

        await Promise.all([
            appWindow.setAlwaysOnTop(true),
            appWindow.setPosition(new PhysicalPosition(monitorX, monitorY)),
        ]);
        if (layerContainerRef.current) {
            layerContainerRef.current.style.width = `${window.screen.width}px`;
            layerContainerRef.current.style.height = `${window.screen.height}px`;
        }
        await Promise.all([appWindow.setFullscreen(true), appWindow.show()]);
        if (process.env.NODE_ENV === 'development') {
            await appWindow.setAlwaysOnTop(false);
        }
    }, []);

    const hideWindow = useCallback(async () => {
        await appWindowRef.current.hide();
    }, []);

    const finishCapture = useCallback<DrawContextType['finishCapture']>(async () => {
        hideWindow();
        await Promise.all([
            drawLayerActionRef.current?.onCaptureFinish(),
            selectLayerActionRef.current?.onCaptureFinish(),
            drawCacheLayerActionRef.current?.onCaptureFinish(),
        ]);
        setCaptureEvent({
            event: CaptureEvent.onCaptureFinish,
        });
        imageBufferRef.current = undefined;
        resetCaptureStep();
        resetDrawState();
        drawToolbarActionRef.current?.setEnable(false);
        capturingRef.current = false;
        history.clear();
    }, [hideWindow, setCaptureEvent, resetCaptureStep, resetDrawState, history]);

    /** 执行截图 */
    const excuteScreenshot = useCallback(async () => {
        const layerOnExecuteScreenshotPromise = Promise.all([
            drawLayerActionRef.current?.onExecuteScreenshot(),
            selectLayerActionRef.current?.onExecuteScreenshot(),
        ]);
        setCaptureEvent({
            event: CaptureEvent.onExecuteScreenshot,
        });

        // 发起截图
        const imageBuffer = await captureCurrentMonitor(ImageEncoder.WebP);
        imageBufferRef.current = imageBuffer;

        // 因为窗口是空的，所以窗口显示和图片显示先后顺序倒无所谓
        await Promise.all([
            showWindow(imageBuffer),
            readyCapture(imageBuffer),
            layerOnExecuteScreenshotPromise,
        ]);
    }, [readyCapture, showWindow, setCaptureEvent]);

    const onSave = useCallback(async () => {
        if (
            !selectLayerActionRef.current ||
            !drawLayerActionRef.current ||
            !drawCacheLayerActionRef.current
        ) {
            return;
        }

        saveToFile(
            selectLayerActionRef.current,
            drawLayerActionRef.current,
            drawCacheLayerActionRef.current,
            async () => {
                finishCapture();
            },
        );
    }, [finishCapture]);

    const onFixed = useCallback(async () => {
        if (
            !layerContainerRef.current ||
            !selectLayerActionRef.current ||
            !imageBufferRef.current ||
            !drawLayerActionRef.current ||
            !drawCacheLayerActionRef.current ||
            !fixedImageActionRef.current
        ) {
            return;
        }

        await fixedToScreen(
            imageBufferRef.current,
            appWindowRef.current,
            layerContainerRef.current,
            selectLayerActionRef.current,
            drawLayerActionRef.current,
            drawCacheLayerActionRef.current,
            fixedImageActionRef.current,
            setCaptureStep,
        );

        switchLayer(undefined, drawLayerActionRef.current, selectLayerActionRef.current);
    }, [setCaptureStep]);

    const onOcrDetect = useCallback(async () => {
        if (
            !imageBufferRef.current ||
            !selectLayerActionRef.current ||
            !drawLayerActionRef.current ||
            !drawCacheLayerActionRef.current ||
            !ocrBlocksActionRef.current
        ) {
            return;
        }

        handleOcrDetect(
            imageBufferRef.current,
            selectLayerActionRef.current,
            drawLayerActionRef.current,
            drawCacheLayerActionRef.current,
            ocrBlocksActionRef.current,
        );
    }, []);

    const onCopyToClipboard = useCallback(async () => {
        if (
            !selectLayerActionRef.current ||
            !drawLayerActionRef.current ||
            !drawCacheLayerActionRef.current
        ) {
            return;
        }

        copyToClipboard(
            selectLayerActionRef.current,
            drawLayerActionRef.current,
            drawCacheLayerActionRef.current,
            async () => {
                finishCapture();
            },
        );
    }, [finishCapture]);

    useEffect(() => {
        if (isFixed) {
            return;
        }

        // 监听截图命令
        const listenerId = addListener('execute-screenshot', () => {
            if (capturingRef.current) {
                return;
            }

            excuteScreenshot();
        });
        return () => {
            removeListener(listenerId);
        };
    }, [addListener, excuteScreenshot, removeListener, isFixed]);

    // 默认隐藏
    useEffect(() => {
        hideWindow();
    }, [hideWindow]);

    const drawContextValue = useMemo<DrawContextType>(() => {
        return {
            finishCapture,
            drawLayerActionRef,
            selectLayerActionRef,
            imageBufferRef,
            drawToolbarActionRef,
            mousePositionRef,
            circleCursorRef,
            drawCacheLayerActionRef,
        };
    }, [finishCapture]);

    useEffect(() => {
        if (isFixed) {
            return;
        }

        const handleMouseMove = (e: MouseEvent) => {
            mousePositionRef.current = new MousePosition(e.clientX, e.clientY);
        };

        document.addEventListener('mousemove', handleMouseMove);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
        };
    }, [isFixed]);

    return (
        <DrawContext.Provider value={drawContextValue}>
            <div className={styles.layerContainer} ref={layerContainerRef}>
                <FixedImage
                    actionRef={fixedImageActionRef}
                    onLoad={() => {
                        setIsFixed(true);
                    }}
                />
                {!isFixed && (
                    <>
                        <DrawLayer actionRef={drawLayerActionRef} />
                        <DrawCacheLayer actionRef={drawCacheLayerActionRef} />
                        <SelectLayer actionRef={selectLayerActionRef} />
                        <DrawToolbar
                            actionRef={drawToolbarActionRef}
                            onCancel={finishCapture}
                            onSave={onSave}
                            onFixed={onFixed}
                            onCopyToClipboard={onCopyToClipboard}
                            onOcrDetect={onOcrDetect}
                        />
                        <ColorPicker
                            onCopyColor={() => {
                                finishCapture();
                            }}
                        />
                        <StatusBar />
                        <OcrBlocks actionRef={ocrBlocksActionRef} />

                        <div
                            ref={circleCursorRef}
                            className={styles.drawToolbarCursor}
                            style={{ zIndex: zIndexs.Draw_Cursor }}
                        />
                    </>
                )}
            </div>
        </DrawContext.Provider>
    );
};

export default React.memo(
    withCanvasHistory(
        withStatePublisher(
            DrawPageCore,
            CaptureStepPublisher,
            DrawStatePublisher,
            CaptureLoadingPublisher,
            EnableKeyEventPublisher,
            ExcalidrawOnChangePublisher,
            CaptureEventPublisher,
            ExcalidrawOnHandleEraserPublisher,
        ),
    ),
);
