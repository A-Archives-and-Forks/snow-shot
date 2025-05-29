import { DrawContext } from '@/app/draw/types';
import { useCallbackRender } from '@/hooks/useCallbackRender';
import { MousePosition } from '@/utils/mousePosition';
import { HolderOutlined } from '@ant-design/icons';
import { theme } from 'antd';
import React, {
    useCallback,
    useContext,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
} from 'react';
import { useIntl } from 'react-intl';
import { DrawToolbarContext, isEnableSubToolbar } from '../../extra';
import { ElementRect } from '@/commands';
import { updateElementPosition } from './extra';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import { DrawState, DrawStatePublisher } from '@/app/fullScreenDraw/components/drawCore/extra';

export type DragButtonActionType = {
    setEnable: (enable: boolean) => void;
};

const DragButtonCore: React.FC<{
    actionRef: React.RefObject<DragButtonActionType | undefined>;
}> = ({ actionRef }) => {
    const enableRef = useRef(false);

    const enableSubToolbarRef = useRef(false);

    const { selectLayerActionRef, imageBufferRef } = useContext(DrawContext);
    const { drawToolbarRef, setDragging, draggingRef } = useContext(DrawToolbarContext);
    const { token } = theme.useToken();

    // 保存 toolbar 位置
    const mouseOriginPositionRef = useRef<MousePosition>(new MousePosition(0, 0));
    const mouseCurrentPositionRef = useRef<MousePosition>(new MousePosition(0, 0));
    const toolbarCurrentRectRef = useRef<ElementRect>({
        min_x: 0,
        min_y: 0,
        max_x: 0,
        max_y: 0,
    });
    const toolbarPreviousRectRef = useRef<ElementRect>(undefined);
    const updateDrawToolbarStyle = useCallback(() => {
        const drawToolbar = drawToolbarRef.current;
        if (!drawToolbar) {
            return;
        }

        const imageBuffer = imageBufferRef.current;
        if (!imageBuffer) {
            return;
        }

        const selectedRect = selectLayerActionRef.current?.getSelectRect();
        if (!selectedRect) {
            return;
        }

        const baseOffsetX =
            selectedRect.max_x / imageBuffer.monitorScaleFactor - drawToolbar.clientWidth;
        const baseOffsetY = selectedRect.max_y / imageBuffer.monitorScaleFactor + token.marginXXS;

        const dragRes = updateElementPosition(
            drawToolbar,
            baseOffsetX,
            baseOffsetY,
            mouseOriginPositionRef.current,
            mouseCurrentPositionRef.current,
            toolbarPreviousRectRef.current,
        );

        toolbarCurrentRectRef.current = dragRes.rect;
        mouseOriginPositionRef.current = dragRes.originPosition;
    }, [drawToolbarRef, imageBufferRef, selectLayerActionRef, token.marginXXS]);
    const updateDrawToolbarStyleRender = useCallbackRender(updateDrawToolbarStyle);

    const handleMouseDown = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            e.stopPropagation();
            setDragging(true);
            mouseOriginPositionRef.current = new MousePosition(e.clientX, e.clientY);
            mouseCurrentPositionRef.current = new MousePosition(e.clientX, e.clientY);
            toolbarPreviousRectRef.current = toolbarCurrentRectRef.current;
        },
        [setDragging],
    );

    // 处理鼠标释放事件
    const handleMouseUp = useCallback(() => {
        if (!draggingRef.current) {
            return;
        }

        setDragging(false);
    }, [draggingRef, setDragging]);

    // 处理鼠标移动事件
    const handleMouseMove = useCallback(
        (mousePosition: MousePosition) => {
            if (!draggingRef.current) return;

            mouseCurrentPositionRef.current = mousePosition;
            updateDrawToolbarStyleRender();
        },
        [draggingRef, updateDrawToolbarStyleRender],
    );

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            const mousePosition = new MousePosition(e.clientX, e.clientY);
            handleMouseMove(mousePosition);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);

    const onEnableChange = useCallback(
        (enable: boolean) => {
            enableRef.current = enable;

            if (enable) {
                drawToolbarRef.current!.style.opacity = '1';
                drawToolbarRef.current!.style.pointerEvents = 'auto';
                updateDrawToolbarStyleRender();
            } else {
                drawToolbarRef.current!.style.opacity = '0';
                drawToolbarRef.current!.style.pointerEvents = 'none';
                toolbarCurrentRectRef.current = {
                    min_x: 0,
                    min_y: 0,
                    max_x: 0,
                    max_y: 0,
                };
                toolbarPreviousRectRef.current = undefined;
                mouseOriginPositionRef.current = new MousePosition(0, 0);
                mouseCurrentPositionRef.current = new MousePosition(0, 0);
            }
        },
        [drawToolbarRef, updateDrawToolbarStyleRender],
    );

    const setEnable = useCallback(
        (enable: boolean) => {
            if (enableRef.current === enable) {
                return;
            }

            onEnableChange(enable);
        },
        [onEnableChange],
    );

    const onDrawStateChange = useCallback(
        (drawState: DrawState) => {
            enableSubToolbarRef.current = isEnableSubToolbar(drawState);

            updateDrawToolbarStyleRender();
        },
        [updateDrawToolbarStyleRender],
    );
    useStateSubscriber(DrawStatePublisher, onDrawStateChange);

    useImperativeHandle(actionRef, () => {
        return {
            setEnable,
        };
    }, [setEnable]);

    const intl = useIntl();
    const dragTitle = useMemo(() => {
        return intl.formatMessage({ id: 'draw.drag' });
    }, [intl]);

    return (
        <div
            className="draw-toolbar-drag drag-button"
            title={dragTitle}
            onMouseDown={handleMouseDown}
        >
            <HolderOutlined />
        </div>
    );
};

export const DragButton = React.memo(DragButtonCore);
