'use client';

import { useCallback, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';
import React from 'react';
import {
    BaseLayerEventActionType,
    withBaseLayer,
    BaseLayerActionType,
    BaseLayerContext,
    defaultBaseLayerActions,
} from '../baseLayer';
import { zIndexs } from '@/utils/zIndex';
import {
    ElementRect,
    getElementFromPosition,
    getWindowElements,
    ImageBuffer,
    initUiElements,
    initUiElementsCache,
} from '@/commands';
import { AppSettingsData, AppSettingsGroup, AppSettingsPublisher } from '@/app/contextWrap';
import { useHotkeys } from 'react-hotkeys-hook';
import * as PIXI from 'pixi.js';
import Flatbush from 'flatbush';
import { useCallbackRender } from '@/hooks/useCallbackRender';
import { TweenAnimation } from '@/utils/tweenAnimation';
import * as TWEEN from '@tweenjs/tween.js';
import {
    convertDragModeToCursor,
    DragMode,
    dragRect,
    drawSelectRect,
    getDragModeFromMousePosition,
    limitRect,
    SelectState,
} from './extra';
import { MousePosition } from '@/utils/mousePosition';
import { getMonitorRect } from '../../extra';
import { CaptureStep, DrawContext } from '../../types';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import { CaptureStepPublisher } from '../../page';

export type SelectLayerActionType = BaseLayerActionType & {
    getSelectRect: () => ElementRect | undefined;
};

export type SelectLayerProps = {
    actionRef: React.RefObject<SelectLayerActionType | undefined>;
};

const SelectLayerCore: React.FC<SelectLayerProps> = ({ actionRef }) => {
    const imageBufferRef = useRef<ImageBuffer | undefined>(undefined);

    const { finishCapture, drawToolbarActionRef } = useContext(DrawContext);
    const { isEnable, addChildToTopContainer, changeCursor, layerContainerElementRef } =
        useContext(BaseLayerContext);

    const [findChildrenElements, setFindChildrenElements] = useState(false);
    const [getAppSettings] = useStateSubscriber(
        AppSettingsPublisher,
        useCallback((settings: AppSettingsData) => {
            setFindChildrenElements(settings[AppSettingsGroup.Screenshot].findChildrenElements);
        }, []),
    );
    const tabFindChildrenElementsRef = useRef<boolean>(false); // 是否查找子元素
    const [tabFindChildrenElements, _setTabFindChildrenElements] = useState<boolean>(false); // Tab 键的切换查找子元素
    const setTabFindChildrenElements = useCallback(
        (value: boolean | ((prev: boolean) => boolean)) => {
            tabFindChildrenElementsRef.current =
                typeof value === 'function' ? value(tabFindChildrenElementsRef.current) : value;
            _setTabFindChildrenElements(value);
        },
        [],
    );
    const elementsListRef = useRef<ElementRect[]>([]); // 窗口元素的列表
    const elementsListRTreeRef = useRef<Flatbush | undefined>(undefined); // 窗口元素的 RTree
    const selectWindowElementLoadingRef = useRef(true); // 是否正在加载元素选择功能
    const overlayRectRef = useRef<PIXI.Graphics | undefined>(undefined); // 全屏遮罩
    const overlayMaskRectControlsRef = useRef<PIXI.Graphics | undefined>(undefined); // 全屏遮罩的 mask 的控制点
    const selectWindowFromMousePositionLevelRef = useRef(0);
    const lastMouseMovePositionRef = useRef<MousePosition | undefined>(undefined); // 上一次鼠标移动事件触发的参数
    const drawSelectRectAnimationRef = useRef<TweenAnimation<ElementRect> | undefined>(undefined); // 绘制选取框的动画
    const selectStateRef = useRef(SelectState.Auto); // 当前的选择状态
    const setSelectState = useCallback(
        (state: SelectState) => {
            if (state === SelectState.Selected) {
                drawToolbarActionRef.current?.setEnable(true);
            } else {
                drawToolbarActionRef.current?.setEnable(false);
                changeCursor('crosshair');
            }

            selectStateRef.current = state;
        },
        [changeCursor, drawToolbarActionRef],
    );
    const mouseDownPositionRef = useRef<MousePosition | undefined>(undefined); // 鼠标按下时的位置
    const dragModeRef = useRef<DragMode | undefined>(undefined); // 拖动模式
    const dragRectRef = useRef<ElementRect | undefined>(undefined); // 拖动矩形
    const enableSelectRef = useRef(false); // 是否启用选择
    const updateEnableSelect = useCallback((captureStep: CaptureStep) => {
        enableSelectRef.current = captureStep === CaptureStep.Select;
    }, []);
    useStateSubscriber(CaptureStepPublisher, updateEnableSelect);

    const getSelectRect = useCallback(() => {
        return drawSelectRectAnimationRef.current?.getTargetObject();
    }, []);

    /**
     * 初始化元素选择功能
     */
    const initSelectWindowElement = useCallback(async () => {
        selectWindowElementLoadingRef.current = true;

        const windowElements = await getWindowElements();
        const initUiElementsCachePromise = initUiElementsCache();

        const rTree = new Flatbush(windowElements.length);
        windowElements.forEach((rect) => {
            rTree.add(rect.min_x, rect.min_y, rect.max_x, rect.max_y);
        });
        rTree.finish();
        elementsListRTreeRef.current = rTree;
        elementsListRef.current = windowElements;

        await initUiElementsCachePromise;
        selectWindowElementLoadingRef.current = false;
    }, []);

    /**
     * 通过鼠标坐标获取候选框
     */
    const getElementRectFromMousePosition = useCallback(
        async (mousePosition: MousePosition): Promise<ElementRect[] | undefined> => {
            if (selectWindowElementLoadingRef.current) {
                return undefined;
            }

            const elementsRTree = elementsListRTreeRef.current;
            if (!elementsRTree) {
                return undefined;
            }

            let elementRectList = undefined;
            if (tabFindChildrenElementsRef.current) {
                try {
                    elementRectList = await getElementFromPosition(
                        mousePosition.mouseX,
                        mousePosition.mouseY,
                    );
                } catch {
                    // 获取元素失败，忽略
                }
            }

            let result;
            if (elementRectList) {
                result = elementRectList;
            } else {
                const rectIndexs = elementsRTree.search(
                    mousePosition.mouseX,
                    mousePosition.mouseY,
                    mousePosition.mouseX,
                    mousePosition.mouseY,
                );
                // 获取的是原始数据的索引，原始数据下标越小的，窗口层级越高，所以优先选择下标小的
                rectIndexs.sort((a, b) => a - b);

                result = rectIndexs.map((index) => {
                    return elementsListRef.current[index];
                });
            }

            return result;
        },
        [],
    );

    const updateSelectRect = useCallback(
        (
            rect: ElementRect,
            imageBuffer: ImageBuffer,
            overlayRect: PIXI.Graphics,
            overlayMaskRectControls: PIXI.Graphics,
        ) => {
            drawSelectRect(
                imageBuffer.monitorWidth,
                imageBuffer.monitorHeight,
                rect,
                overlayRect,
                overlayMaskRectControls,
                getAppSettings()[AppSettingsGroup.Common].darkMode,
                imageBuffer.monitorScaleFactor,
            );
        },
        [getAppSettings],
    );

    const initAnimation = useCallback(
        (
            imageBuffer: ImageBuffer,
            overlayRect: PIXI.Graphics,
            overlayMaskRectControls: PIXI.Graphics,
        ) => {
            if (drawSelectRectAnimationRef.current) {
                drawSelectRectAnimationRef.current.dispose();
            }

            drawSelectRectAnimationRef.current = new TweenAnimation<ElementRect>(
                {
                    min_x: 0,
                    min_y: 0,
                    max_x: imageBuffer.monitorWidth,
                    max_y: imageBuffer.monitorHeight,
                },
                TWEEN.Easing.Quadratic.Out,
                1 * 100,
                (rect) => {
                    updateSelectRect(rect, imageBuffer, overlayRect, overlayMaskRectControls);
                },
            );
        },
        [updateSelectRect],
    );

    const onCaptureReady = useCallback<BaseLayerEventActionType['onCaptureReady']>(
        async (_texture, imageBuffer): Promise<void> => {
            imageBufferRef.current = imageBuffer;
            const { mouseX, mouseY } = imageBuffer;
            // 初始化下坐标，用来在触发鼠标移动事件前选取坐标
            lastMouseMovePositionRef.current = new MousePosition(mouseX, mouseY);
            // 初始化下选择状态
            setSelectState(SelectState.Auto);

            // 创建一个全屏遮罩
            const overlayRect = new PIXI.Graphics({
                cullable: true,
            });
            const overlayControls = new PIXI.Graphics({
                cullable: true,
            });

            addChildToTopContainer(overlayRect);
            addChildToTopContainer(overlayControls);

            overlayRectRef.current = overlayRect;
            overlayMaskRectControlsRef.current = overlayControls;

            initAnimation(imageBuffer, overlayRect, overlayControls);
        },
        [addChildToTopContainer, initAnimation, setSelectState],
    );

    const onCaptureLoad = useCallback<
        BaseLayerEventActionType['onCaptureLoad']
    >(async () => {}, []);

    const onCaptureFinish = useCallback<BaseLayerEventActionType['onCaptureFinish']>(async () => {
        imageBufferRef.current = undefined;
        selectWindowElementLoadingRef.current = true;
        elementsListRTreeRef.current = undefined;
        elementsListRef.current = [];
        lastMouseMovePositionRef.current = undefined;
    }, []);

    const autoSelect = useCallback(
        async (mousePosition: MousePosition): Promise<ElementRect> => {
            let elementRectList = await getElementRectFromMousePosition(mousePosition);

            if (!elementRectList || elementRectList.length === 0) {
                elementRectList = [getMonitorRect(imageBufferRef.current)];
            }

            const minLevel = 0;
            const maxLevel = Math.max(elementRectList.length - 1, minLevel);
            let currentLevel = selectWindowFromMousePositionLevelRef.current;
            if (currentLevel < minLevel) {
                currentLevel = minLevel;
            } else if (currentLevel > maxLevel) {
                currentLevel = maxLevel;
                selectWindowFromMousePositionLevelRef.current = maxLevel;
            }

            return elementRectList[currentLevel];
        },
        [getElementRectFromMousePosition],
    );

    const updateDragMode = useCallback(
        (mousePosition: MousePosition): DragMode => {
            dragModeRef.current = getDragModeFromMousePosition(getSelectRect()!, mousePosition);

            changeCursor(convertDragModeToCursor(dragModeRef.current));

            return dragModeRef.current;
        },
        [changeCursor, getSelectRect],
    );

    const onMouseDown = useCallback(
        (mousePosition: MousePosition) => {
            mouseDownPositionRef.current = mousePosition;
            if (selectStateRef.current === SelectState.Auto) {
            } else if (selectStateRef.current === SelectState.Selected) {
                // 改变状态为拖动
                setSelectState(SelectState.Drag);
                updateDragMode(mousePosition);
                dragRectRef.current = getSelectRect()!;
            }
        },
        [getSelectRect, setSelectState, updateDragMode],
    );
    const onMouseMove = useCallback(
        async (mousePosition: MousePosition) => {
            // 检测下鼠标移动的距离
            lastMouseMovePositionRef.current = mousePosition;

            if (selectStateRef.current === SelectState.Auto) {
                if (mouseDownPositionRef.current) {
                    // 检测拖动距离是否启用手动选择
                    const maxDistance = mouseDownPositionRef.current.getMaxDistance(mousePosition);
                    if (maxDistance > 9) {
                        setSelectState(SelectState.Manual);
                    }
                }

                drawSelectRectAnimationRef.current?.update(await autoSelect(mousePosition));
            } else if (selectStateRef.current === SelectState.Manual) {
                if (!mouseDownPositionRef.current) {
                    return;
                }

                drawSelectRectAnimationRef.current?.update(
                    mouseDownPositionRef.current.toElementRect(mousePosition),
                    true,
                );
            } else if (selectStateRef.current === SelectState.Selected) {
                updateDragMode(mousePosition);
            } else if (selectStateRef.current === SelectState.Drag) {
                if (!mouseDownPositionRef.current) {
                    return;
                }

                drawSelectRectAnimationRef.current?.update(
                    dragRect(
                        dragModeRef.current!,
                        dragRectRef.current!,
                        mouseDownPositionRef.current,
                        mousePosition,
                    ),
                    true,
                );
            }
        },
        [autoSelect, setSelectState, updateDragMode],
    );
    const onMouseUp = useCallback(() => {
        if (!mouseDownPositionRef.current) {
            return;
        }

        if (selectStateRef.current === SelectState.Auto) {
            setSelectState(SelectState.Selected);
        } else if (selectStateRef.current === SelectState.Manual) {
            setSelectState(SelectState.Selected);
        } else if (selectStateRef.current === SelectState.Drag) {
            setSelectState(SelectState.Selected);
            drawSelectRectAnimationRef.current?.update(
                limitRect(
                    drawSelectRectAnimationRef.current.getTargetObject(),
                    getMonitorRect(imageBufferRef.current),
                ),
            );
            dragRectRef.current = undefined;
        }

        mouseDownPositionRef.current = undefined;
    }, [setSelectState]);

    const onMouseMoveRenderCallback = useCallbackRender(onMouseMove);
    // 用上一次的鼠标移动事件触发 onMouseMove 来更新一些状态
    const refreshMouseMove = useCallback(() => {
        if (!lastMouseMovePositionRef.current) {
            return;
        }

        onMouseMove(lastMouseMovePositionRef.current);
    }, [onMouseMove]);
    const onMouseWheel = useCallback(
        (e: WheelEvent) => {
            if (selectStateRef.current !== SelectState.Auto) {
                return;
            }

            const deltaLevel = e.deltaY > 0 ? 1 : -1;
            selectWindowFromMousePositionLevelRef.current = Math.max(
                selectWindowFromMousePositionLevelRef.current + deltaLevel,
                0,
            );
            refreshMouseMove();
        },
        [refreshMouseMove],
    );
    const onMouseWheelRenderCallback = useCallbackRender(onMouseWheel);

    const onExecuteScreenshot = useCallback<
        BaseLayerEventActionType['onExecuteScreenshot']
    >(async () => {
        await initSelectWindowElement();

        // 初始化可能晚于截图准备
        refreshMouseMove();
    }, [initSelectWindowElement, refreshMouseMove]);

    useEffect(() => {
        initUiElements();

        return () => {
            drawSelectRectAnimationRef.current?.dispose();
        };
    }, []);

    useEffect(() => {
        setTabFindChildrenElements(findChildrenElements);
    }, [findChildrenElements, setTabFindChildrenElements]);
    // 查找子元素切换时，刷新选取
    useEffect(() => {
        refreshMouseMove();
    }, [tabFindChildrenElements, refreshMouseMove]);

    useEffect(() => {
        if (!isEnable) {
            return;
        }

        const layerContainerElement = layerContainerElementRef.current;
        if (!layerContainerElement) {
            return;
        }

        const handleMouseDown = (e: MouseEvent) => {
            if (!enableSelectRef.current) {
                return;
            }

            if (e.button !== 0) {
                return;
            }

            if (!imageBufferRef.current) {
                return;
            }

            onMouseDown(
                new MousePosition(e.clientX, e.clientY).scale(
                    imageBufferRef.current.monitorScaleFactor,
                ),
            );
        };
        const handleMouseMove = (e: MouseEvent) => {
            if (!enableSelectRef.current) {
                return;
            }

            if (!imageBufferRef.current) {
                return;
            }

            onMouseMoveRenderCallback(
                new MousePosition(e.clientX, e.clientY).scale(
                    imageBufferRef.current.monitorScaleFactor,
                ),
            );
        };
        const handleMouseUp = (e: MouseEvent) => {
            if (!enableSelectRef.current) {
                return;
            }

            if (e.button !== 0) {
                return;
            }

            onMouseUp();
        };
        layerContainerElement.addEventListener('mousedown', handleMouseDown);
        layerContainerElement.addEventListener('mousemove', handleMouseMove);
        layerContainerElement.addEventListener('mouseup', handleMouseUp);
        layerContainerElement.addEventListener('wheel', onMouseWheelRenderCallback, {
            passive: true,
        });
        return () => {
            layerContainerElement.removeEventListener('mousedown', handleMouseDown);
            layerContainerElement.removeEventListener('mousemove', handleMouseMove);
            layerContainerElement.removeEventListener('mouseup', handleMouseUp);
            layerContainerElement.removeEventListener('wheel', onMouseWheelRenderCallback);
        };
    }, [
        isEnable,
        layerContainerElementRef,
        onMouseDown,
        onMouseMoveRenderCallback,
        onMouseUp,
        onMouseWheelRenderCallback,
    ]);

    useImperativeHandle(
        actionRef,
        () => ({
            ...defaultBaseLayerActions,
            onExecuteScreenshot,
            onCaptureReady: async (texture, imageBuffer) => {
                await onCaptureReady(texture, imageBuffer);
                refreshMouseMove();
            },
            onCaptureLoad,
            onCaptureFinish,
            getSelectRect,
        }),
        [
            getSelectRect,
            onCaptureFinish,
            onCaptureLoad,
            onCaptureReady,
            onExecuteScreenshot,
            refreshMouseMove,
        ],
    );

    useHotkeys(
        'Tab',
        () => {
            if (!enableSelectRef.current) {
                return;
            }

            setTabFindChildrenElements((prev) => !prev);
        },
        {
            preventDefault: true,
            enabled: isEnable && getAppSettings()[AppSettingsGroup.Screenshot].findChildrenElements,
        },
    );

    useEffect(() => {
        if (!isEnable) {
            return;
        }

        const mouseRightClick = (e: MouseEvent) => {
            e.preventDefault();
            // 回退到选择
            if (selectStateRef.current === SelectState.Selected) {
                setSelectState(SelectState.Auto);
                refreshMouseMove();
            } else if (selectStateRef.current === SelectState.Auto) {
                // 取消截图
                finishCapture();
            }
        };

        document.addEventListener('contextmenu', mouseRightClick);

        return () => {
            document.removeEventListener('contextmenu', mouseRightClick);
        };
    }, [finishCapture, isEnable, refreshMouseMove, setSelectState]);

    return <></>;
};

export default withBaseLayer(SelectLayerCore, zIndexs.Draw_SelectLayer);
