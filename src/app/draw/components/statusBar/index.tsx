import { Descriptions, theme } from 'antd';
import { CaptureStep, DrawContext } from '../../types';
import Color from 'color';
import { FormattedMessage } from 'react-intl';
import { AppSettingsGroup, AppSettingsPublisher } from '@/app/contextWrap';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardIcon, MouseIcon } from '@/components/icons';
import { DescriptionsItemType } from 'antd/es/descriptions';
import { zIndexs } from '@/utils/zIndex';
import {
    CaptureLoadingPublisher,
    CaptureStepPublisher,
    DrawEvent,
    DrawEventParams,
    DrawEventPublisher,
    ScreenshotTypePublisher,
} from '../../extra';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import { getMaskBackgroundColor } from '../selectLayer/extra';
import { MousePosition } from '@/utils/mousePosition';
import { useCallbackRender } from '@/hooks/useCallbackRender';
import { debounce } from 'es-toolkit';
import { ScreenshotType } from '@/functions/screenshot';
import { DrawState, DrawStatePublisher } from '@/app/fullScreenDraw/components/drawCore/extra';
import { useAppSettingsLoad } from '@/hooks/useAppSettingsLoad';
import { getPlatformValue } from '@/utils';
import { ElementRect } from '@/commands';
import { formatKey } from '@/utils/format';

const KeyLabel: React.FC<{
    messageId?: string;
    hotKey?: string;
    icon?: React.ReactNode;
}> = ({ messageId, hotKey, icon }) => {
    const formatHotKey = useMemo(() => {
        return formatKey(hotKey);
    }, [hotKey]);

    return (
        <div className="descriptions-item-btn-label">
            <div className="descriptions-item-btn-label-icon">{icon ?? <KeyboardIcon />}</div>
            {messageId && <FormattedMessage id={messageId} />}
            {formatHotKey}
        </div>
    );
};

const StatusBar: React.FC = () => {
    const { token } = theme.useToken();

    const [darkMode, setDarkMode] = useState(false);
    const [hotKeyTipOpacity, setHotKeyTipOpacity] = useState(100);
    useAppSettingsLoad(
        useCallback((settings) => {
            setDarkMode(settings[AppSettingsGroup.Common].darkMode);
            setHotKeyTipOpacity(settings[AppSettingsGroup.Screenshot].hotKeyTipOpacity);
        }, []),
        true,
    );

    const [getAppSettings] = useStateSubscriber(AppSettingsPublisher, undefined);

    const statusBarRef = useRef<HTMLDivElement>(null);
    const { selectLayerActionRef } = useContext(DrawContext);
    const [getCaptureStep] = useStateSubscriber(CaptureStepPublisher, undefined);
    const [getDrawState] = useStateSubscriber(DrawStatePublisher, undefined);
    const [isHover, setIsHover] = useState(false);
    const onCaptureLoadingChange = useCallback((captureLoading: boolean) => {
        setIsHover(captureLoading);
    }, []);
    const [getCaptureLoading] = useStateSubscriber(CaptureLoadingPublisher, onCaptureLoadingChange);

    const [descriptionsItems, setDescriptionsItems] = useState<DescriptionsItemType[]>([]);

    const [getScreenshotType] = useStateSubscriber(ScreenshotTypePublisher, undefined);
    const updateDescriptionsItems = useCallback(() => {
        if (getScreenshotType() === ScreenshotType.TopWindow) {
            setDescriptionsItems([]);
            return;
        }

        const {
            colorPickerCopy: { hotKey: colorPickerCopyHotKey },
            colorPickerMoveUp: { hotKey: colorPickerMoveUpHotKey },
            colorPickerMoveDown: { hotKey: colorPickerMoveDownHotKey },
            colorPickerMoveLeft: { hotKey: colorPickerMoveLeftHotKey },
            colorPickerMoveRight: { hotKey: colorPickerMoveRightHotKey },
            maintainAspectRatioPicker: { hotKey: maintainAspectRatioPickerHotKey },
            rotateWithDiscreteAnglePicker: { hotKey: rotateWithDiscreteAnglePickerHotKey },
            resizeFromCenterPicker: { hotKey: resizeFromCenterPickerHotKey },
            autoAlignPicker: { hotKey: autoAlignPickerHotKey },
            switchColorFormat: { hotKey: switchColorFormatHotKey },
            serialNumberDisableArrow: { hotKey: serialNumberDisableArrowHotKey },
            selectPrevRectTool: { hotKey: selectPrevRectToolHotKey },
        } = getAppSettings()[AppSettingsGroup.DrawToolbarKeyEvent];

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
                ...getPlatformValue(
                    [
                        {
                            key: 'selectWindowOrElement',
                            label: <FormattedMessage id="draw.selectWindowOrElement" />,
                            children: <KeyLabel messageId="draw.tabKey" />,
                        },
                    ],
                    [],
                ),
                {
                    key: 'changeSelectLevel',
                    label: <FormattedMessage id="draw.changeSelectLevel" />,
                    children: <KeyLabel icon={<MouseIcon />} messageId="draw.mouseWheel" />,
                },
                {
                    key: 'selectPrevRectTool',
                    label: <FormattedMessage id="draw.selectPrevRectTool" />,
                    children: <KeyLabel hotKey={selectPrevRectToolHotKey} />,
                },
                {
                    key: 'colorPickerCopy',
                    label: <FormattedMessage id="draw.colorPickerCopy" />,
                    children: <KeyLabel hotKey={colorPickerCopyHotKey} />,
                },
                {
                    key: 'switchColorFormat',
                    label: <FormattedMessage id="draw.switchColorFormat" />,
                    children: <KeyLabel hotKey={switchColorFormatHotKey} />,
                },
            ].forEach((item) => {
                items.push(item);
            });
        }

        if (
            drawState === DrawState.Rect ||
            drawState === DrawState.Ellipse ||
            drawState === DrawState.Blur ||
            drawState === DrawState.Diamond
        ) {
            items.push({
                key: 'maintainAspectRatioPicker',
                label: <FormattedMessage id="draw.maintainAspectRatioPicker" />,
                children: <KeyLabel hotKey={maintainAspectRatioPickerHotKey} />,
            });
            items.push({
                key: 'resizeFromCenterPicker',
                label: <FormattedMessage id="draw.resizeFromCenterPicker" />,
                children: <KeyLabel hotKey={resizeFromCenterPickerHotKey} />,
            });
            items.push({
                key: 'autoAlignPicker',
                label: <FormattedMessage id="draw.autoAlignPicker" />,
                children: <KeyLabel hotKey={autoAlignPickerHotKey} />,
            });
        }

        if (drawState === DrawState.Arrow || drawState === DrawState.Line) {
            items.push({
                key: 'rotateWithDiscreteAnglePicker',
                label: <FormattedMessage id="draw.rotateWithDiscreteAnglePicker" />,
                children: <KeyLabel hotKey={rotateWithDiscreteAnglePickerHotKey} />,
            });
        }

        if (drawState === DrawState.SerialNumber) {
            items.push({
                key: 'serialNumberDisableArrow',
                label: <FormattedMessage id="draw.serialNumberDisableArrow2" />,
                children: <KeyLabel hotKey={serialNumberDisableArrowHotKey} />,
            });
        }

        setDescriptionsItems(items);
    }, [getAppSettings, getCaptureStep, getDrawState, getScreenshotType]);
    const updateDescriptionsItemsDebounce = useMemo(
        () => debounce(updateDescriptionsItems, 0),
        [updateDescriptionsItems],
    );
    useStateSubscriber(CaptureStepPublisher, updateDescriptionsItemsDebounce);
    useStateSubscriber(DrawStatePublisher, updateDescriptionsItemsDebounce);
    useStateSubscriber(ScreenshotTypePublisher, updateDescriptionsItemsDebounce);

    const onMouseMove = useCallback(
        (mousePosition: MousePosition) => {
            const statusBar = statusBarRef.current;
            if (!statusBar) {
                return;
            }

            const statusBarMaxX = statusBar.clientWidth + statusBar.offsetLeft;
            const statusBarMinY = statusBar.offsetTop - statusBar.clientHeight;

            if (mousePosition.mouseX < statusBarMaxX && mousePosition.mouseY > statusBarMinY) {
                setIsHover(true);
                return;
            }

            const selectRect = selectLayerActionRef.current?.getSelectRect();
            if (!selectRect) {
                setIsHover(false);
                return;
            }
            const minX = selectRect.min_x / window.devicePixelRatio;
            const maxY = selectRect.max_y / window.devicePixelRatio;
            // 矩形现在是正的了，只判断左下角即可
            if (minX < statusBarMaxX && maxY > statusBarMinY) {
                setIsHover(true);
                return;
            }

            setIsHover(false);
        },
        [selectLayerActionRef],
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

    const [monitorRect, setMonitorRect] = useState<ElementRect>({
        min_x: 0,
        min_y: 0,
        max_x: 0,
        max_y: 0,
    });
    useStateSubscriber(
        DrawEventPublisher,
        useCallback((event: DrawEventParams) => {
            if (event?.event === DrawEvent.ChangeMonitor) {
                setMonitorRect({
                    min_x: event.params.monitorRect.min_x / window.devicePixelRatio,
                    min_y: event.params.monitorRect.min_y / window.devicePixelRatio,
                    max_x: event.params.monitorRect.max_x / window.devicePixelRatio,
                    max_y: event.params.monitorRect.max_y / window.devicePixelRatio,
                });
            }
        }, []),
    );

    return (
        <div
            className="status-bar"
            ref={statusBarRef}
            style={{
                opacity: descriptionsItems.length === 0 || isHover ? 0 : hotKeyTipOpacity / 100,
            }}
        >
            <div className="status-bar-content">
                <Descriptions column={1} items={descriptionsItems} />
            </div>

            <style jsx>{`
                {/* 在这里处理下 antd message 的样式*/}
                :global(.app-global-message) {
                    top: ${monitorRect.min_y}px !important;
                    left: ${monitorRect.min_x}px !important;
                    width: ${monitorRect.max_x - monitorRect.min_x}px !important;
                    transform: unset !important;
                }

                .status-bar {
                    position: fixed;
                    top: ${monitorRect.max_y}px;
                    left: ${monitorRect.min_x}px;
                    transform: translate(0, -100%);
                    padding: ${token.paddingLG}px ${token.paddingLG}px ${token.padding}px
                        ${token.padding}px;
                    transition: opacity ${token.motionDurationMid} ${token.motionEaseInOut};
                    opacity: ${descriptionsItems.length > 0 ? 1 : 0};
                    pointer-events: none;
                    display: inline-block;
                    z-index: ${zIndexs.Draw_StatusBar};
                    box-sizing: border-box;
                    user-select: none;
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
