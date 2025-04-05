import { Descriptions, theme } from 'antd';
import { CaptureStep, DrawContext, DrawState } from '../../types';
import Color from 'color';
import { FormattedMessage } from 'react-intl';
import { AppSettingsContext, AppSettingsGroup } from '@/app/contextWrap';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { KeyboardIcon, MouseIcon } from '@/components/icons';
import { DescriptionsItemType } from 'antd/es/descriptions';
import { zIndexs } from '@/utils/zIndex';
import { CaptureLoadingPublisher, CaptureStepPublisher, DrawStatePublisher } from '../../page';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import { getMaskBackgroundColor } from '../selectLayer/extra';
import { MousePosition } from '@/utils/mousePosition';
import { useCallbackRender } from '@/hooks/useCallbackRender';

const KeyLabel: React.FC<{
    messageId?: string;
    hotKey?: string;
    icon?: React.ReactNode;
}> = ({ messageId, hotKey, icon }) => {
    return (
        <div className="descriptions-item-btn-label">
            <div className="descriptions-item-btn-label-icon">{icon ?? <KeyboardIcon />}</div>
            {messageId && <FormattedMessage id={messageId} />}
            {hotKey}
        </div>
    );
};

const StatusBar: React.FC = () => {
    const { token } = theme.useToken();
    const appSettings = useContext(AppSettingsContext);
    const { darkMode } = appSettings[AppSettingsGroup.Common];
    const {
        colorPickerCopy: { hotKey: colorPickerCopyHotKey },
        colorPickerMoveUp: { hotKey: colorPickerMoveUpHotKey },
        colorPickerMoveDown: { hotKey: colorPickerMoveDownHotKey },
        colorPickerMoveLeft: { hotKey: colorPickerMoveLeftHotKey },
        colorPickerMoveRight: { hotKey: colorPickerMoveRightHotKey },
        lockWidthHeightPicker: { hotKey: lockWidthHeightPickerHotKey },
    } = appSettings[AppSettingsGroup.DrawToolbarKeyEvent];

    const statusBarRef = useRef<HTMLDivElement>(null);
    const { selectLayerActionRef, imageBufferRef } = useContext(DrawContext);
    const [getCaptureStep] = useStateSubscriber(CaptureStepPublisher, undefined);
    const [getDrawState] = useStateSubscriber(DrawStatePublisher, undefined);
    const [isHover, setIsHover] = useState(false);
    const onCaptureLoadingChange = useCallback((captureLoading: boolean) => {
        setIsHover(captureLoading);
    }, []);
    const [getCaptureLoading] = useStateSubscriber(CaptureLoadingPublisher, onCaptureLoadingChange);


    const [descriptionsItems, setDescriptionsItems] = useState<DescriptionsItemType[]>([]);
    const updateDescriptionsItems = useCallback(() => {
        const items: DescriptionsItemType[] = [
            {
                key: 'colorPickerMoveUp',
                label: <FormattedMessage id="draw.colorPickerMoveUp" />,
                children: <KeyLabel hotKey={colorPickerMoveUpHotKey} />,
            },
            {
                key: 'colorPickerMoveDown',
                label: <FormattedMessage id="draw.colorPickerMoveDown" />,
                children: <KeyLabel hotKey={colorPickerMoveDownHotKey} />,
            },
            {
                key: 'colorPickerMoveLeft',
                label: <FormattedMessage id="draw.colorPickerMoveLeft" />,
                children: <KeyLabel hotKey={colorPickerMoveLeftHotKey} />,
            },
            {
                key: 'colorPickerMoveRight',
                label: <FormattedMessage id="draw.colorPickerMoveRight" />,
                children: <KeyLabel hotKey={colorPickerMoveRightHotKey} />,
            },
        ];

        const captureStep = getCaptureStep();
        const drawState = getDrawState();

        if (captureStep === CaptureStep.Select) {
            [
                {
                    key: 'selectWindowOrElement',
                    label: <FormattedMessage id="draw.selectWindowOrElement" />,
                    children: <KeyLabel messageId="draw.tabKey" />,
                },
                {
                    key: 'changeSelectLevel',
                    label: <FormattedMessage id="draw.changeSelectLevel" />,
                    children: <KeyLabel icon={<MouseIcon />} messageId="draw.mouseWheel" />,
                },
                {
                    key: 'colorPickerCopy',
                    label: <FormattedMessage id="draw.colorPickerCopy" />,
                    children: <KeyLabel hotKey={colorPickerCopyHotKey} />,
                },
            ].forEach((item) => {
                items.push(item);
            });
        }

        if (drawState === DrawState.Rect || drawState === DrawState.Ellipse) {
            items.push({
                key: 'lockWidthHeightPicker',
                label: <FormattedMessage id="draw.lockWidthHeightPicker" />,
                children: <KeyLabel hotKey={lockWidthHeightPickerHotKey} />,
            });
        }

        // if (
        //     drawState === DrawState.Pen ||
        //     drawState === DrawState.Eraser ||
        //     drawState === DrawState.Highlight ||
        //     drawState === DrawState.Mosaic
        // ) {
        //     items.push({
        //         key: 'penDrawLine',
        //         label: <FormattedMessage id="draw.penDrawLine" />,
        //         children: <KeyLabel messageId="draw.shiftKey" />,
        //     });
        // }
        setDescriptionsItems(items);
    }, [
        colorPickerCopyHotKey,
        colorPickerMoveDownHotKey,
        colorPickerMoveLeftHotKey,
        colorPickerMoveRightHotKey,
        colorPickerMoveUpHotKey,
        getCaptureStep,
        getDrawState,
        lockWidthHeightPickerHotKey,
    ]);
    useStateSubscriber(CaptureStepPublisher, updateDescriptionsItems);
    useStateSubscriber(DrawStatePublisher, updateDescriptionsItems);

    const onMouseMove = useCallback(
        (mousePosition: MousePosition) => {
            const statusBar = statusBarRef.current;
            if (!statusBar) {
                return;
            }

            if (!imageBufferRef.current) {
                return;
            }

            const statusBarMaxX = statusBar.clientWidth + statusBar.offsetLeft;
            const statusBarMinY = statusBar.offsetTop;

            if (mousePosition.mouseX < statusBarMaxX && mousePosition.mouseY > statusBarMinY) {
                setIsHover(true);
                return;
            }

            const selectRect = selectLayerActionRef.current?.getSelectRect();
            if (!selectRect) {
                setIsHover(false);
                return;
            }
            const minX = selectRect.min_x / imageBufferRef.current.monitorScaleFactor;
            const maxY = selectRect.max_y / imageBufferRef.current.monitorScaleFactor;
            // 矩形现在是正的了，只判断左下角即可
            if (minX < statusBarMaxX && maxY > statusBarMinY) {
                setIsHover(true);
                return;
            }

            setIsHover(false);
        },
        [imageBufferRef, selectLayerActionRef],
    );
    const onMouseMoveRender = useCallbackRender(onMouseMove);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (getCaptureLoading()) {
                return;
            }

            onMouseMoveRender(new MousePosition(e.clientX, e.clientY));
        };

        document.addEventListener('mousemove', handleMouseMove);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
        };
    }, [getCaptureLoading, onMouseMoveRender, selectLayerActionRef]);

    return (
        <div
            className="status-bar"
            ref={statusBarRef}
            style={{ opacity: descriptionsItems.length === 0 || isHover ? 0 : 1 }}
        >
            <div className="status-bar-content">
                <Descriptions column={1} items={descriptionsItems} />
            </div>

            <style jsx>{`
                .status-bar {
                    position: fixed;
                    bottom: 0px;
                    left: 0px;
                    padding: ${token.paddingLG}px ${token.paddingLG}px ${token.padding}px
                        ${token.padding}px;
                    transition: opacity ${token.motionDurationMid} ${token.motionEaseInOut};
                    opacity: ${descriptionsItems.length > 0 ? 1 : 0};
                    pointer-events: none;
                    display: inline-block;
                    z-index: ${zIndexs.Draw_StatusBar};
                    min-width: 383px;
                    box-sizing: border-box;
                }

                .status-bar-content {
                    background-color: ${Color(getMaskBackgroundColor(darkMode))
                        .alpha(0.42)
                        .toString()};
                    display: inline-block;
                    box-sizing: border-box;
                    padding: ${token.padding}px ${token.padding}px;
                    border-radius: ${token.borderRadius}px;
                }

                .status-bar-content :global(.ant-descriptions .ant-descriptions-item-label) {
                    color: rgba(255, 255, 255, 0.72) !important;
                }

                .status-bar-content
                    :global(
                        .ant-descriptions .ant-descriptions-item-content .ant-badge-status-text
                    ),
                :global(.ant-descriptions-item-content) {
                    color: white !important;
                }

                .status-bar-content :global(.descriptions-item-btn-label) {
                    margin-left: ${token.padding}px;
                    margin-right: ${token.marginXS + token.padding}px;
                    display: flex;
                    align-items: center;
                    position: relative;
                }

                .status-bar-content :global(.descriptions-item-btn-label)::after {
                    content: '';
                    display: block;
                    position: absolute;
                    top: -${token.paddingXXS / 2}px;
                    left: -${token.padding}px;
                    width: 100%;
                    height: 100%;
                    padding: ${token.paddingXXS / 2}px ${token.padding}px;
                    border-radius: ${token.borderRadius}px;
                    border: 1px solid currentColor;
                }

                .status-bar-content
                    :global(.descriptions-item-btn-label .descriptions-item-btn-label-icon) {
                    margin-right: ${token.marginXS}px;
                }

                .status-bar-content :global(.ant-descriptions) {
                    display: inline-block;
                }

                .status-bar-content :global(.ant-descriptions-view) {
                    display: inline-block;
                }

                .status-bar-content :global(.ant-descriptions-view table) {
                    display: inline-block;
                }
            `}</style>
        </div>
    );
};

export default StatusBar;
