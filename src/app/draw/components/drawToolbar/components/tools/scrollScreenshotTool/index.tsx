import { DrawStatePublisher } from '@/app/draw/extra';
import { DrawContext, DrawState } from '@/app/draw/types';
import { ElementRect } from '@/commands';
import { scrollThrough } from '@/commands/core';
import {
    SCROLL_SCREENSHOT_CAPTURE_RESULT_EXTRA_DATA_SIZE,
    ScrollDirection,
    ScrollImageList,
    scrollScreenshotCapture,
    ScrollScreenshotCaptureResult,
    ScrollScreenshotCaptureSize,
    scrollScreenshotClear,
    scrollScreenshotGetSize,
    scrollScreenshotInit,
} from '@/commands/scrollScreenshot';
import { useStateRef } from '@/hooks/useStateRef';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import { zIndexs } from '@/utils/zIndex';
import { Button, Spin, theme } from 'antd';
import { debounce } from 'es-toolkit';
import {
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    WheelEventHandler,
} from 'react';
import { useIntl } from 'react-intl';
import { SubTools } from '../../subTools';
import { RotateIcon } from '@/components/icons';
import { AppSettingsGroup, AppSettingsPublisher } from '@/app/contextWrap';
import { AntdContext } from '@/components/globalLayoutExtra';

const THUMBNAIL_WIDTH = 128;

export const ScrollScreenshot = () => {
    const { message } = useContext(AntdContext);
    const intl = useIntl();
    const { token } = theme.useToken();

    const [loading, setLoading, loadingRef] = useStateRef(false);
    const { selectLayerActionRef, imageBufferRef } = useContext(DrawContext);
    const [positionRect, setPositionRect, positionRectRef] = useStateRef<ElementRect | undefined>(
        undefined,
    );
    const [getAppSettings] = useStateSubscriber(AppSettingsPublisher, undefined);

    const enableScrollThroughRef = useRef(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const prevScrollSizeRef = useRef<ScrollScreenshotCaptureSize>({
        top_image_size: 0,
        bottom_image_size: 0,
    });
    const [topImageUrlList, setTopImageUrlList, topImageUrlListRef] = useStateRef<string[]>([]);
    const [bottomImageUrlList, setBottomImageUrlList, bottomImageUrlListRef] = useStateRef<
        string[]
    >([]);

    const releaseImageUrlList = useCallback(() => {
        topImageUrlListRef.current.forEach((url) => {
            URL.revokeObjectURL(url);
        });
        bottomImageUrlListRef.current.forEach((url) => {
            URL.revokeObjectURL(url);
        });
        setTopImageUrlList([]);
        setBottomImageUrlList([]);
    }, [setBottomImageUrlList, setTopImageUrlList, topImageUrlListRef, bottomImageUrlListRef]);
    useEffect(() => {
        return releaseImageUrlList;
    }, [releaseImageUrlList]);

    const [captuerEdgePosition, setCaptuerEdgePosition] = useState<number | undefined>(undefined);

    const [scrollDirection, setScrollDirection, scrollDirectionRef] = useStateRef<ScrollDirection>(
        ScrollDirection.Vertical,
    );

    const scrollTo = useMemo(() => {
        return debounce((value: number) => {
            scrollRef.current!.scrollTo(
                scrollDirectionRef.current === ScrollDirection.Horizontal
                    ? {
                          left: value,
                          behavior: 'smooth',
                      }
                    : {
                          top: value,
                          behavior: 'smooth',
                      },
            );
        }, 128);
    }, [scrollDirectionRef]);

    const updateImageUrlList = useCallback(
        async (captureResult: ScrollScreenshotCaptureResult) => {
            const currentScrollSize = await scrollScreenshotGetSize();

            const edgePosition = captureResult.edge_position!;

            let positionScale: number;
            if (scrollDirectionRef.current === ScrollDirection.Horizontal) {
                positionScale =
                    THUMBNAIL_WIDTH /
                    ((positionRectRef.current!.max_y - positionRectRef.current!.min_y) *
                        imageBufferRef.current!.monitorScaleFactor);
            } else {
                positionScale =
                    THUMBNAIL_WIDTH /
                    ((positionRectRef.current!.max_x - positionRectRef.current!.min_x) *
                        imageBufferRef.current!.monitorScaleFactor);
            }
            const thumbnailHeight =
                scrollDirectionRef.current === ScrollDirection.Horizontal
                    ? (THUMBNAIL_WIDTH *
                          (positionRectRef.current!.max_x - positionRectRef.current!.min_x)) /
                      (positionRectRef.current!.max_y - positionRectRef.current!.min_y)
                    : (THUMBNAIL_WIDTH *
                          (positionRectRef.current!.max_y - positionRectRef.current!.min_y)) /
                      (positionRectRef.current!.max_x - positionRectRef.current!.min_x);

            let captuerEdge = (currentScrollSize.top_image_size + edgePosition) * positionScale;
            if (edgePosition > 0) {
                captuerEdge -= thumbnailHeight;
            }

            setCaptuerEdgePosition(captuerEdge);

            if (
                captureResult.thumbnail_buffer.byteLength <=
                SCROLL_SCREENSHOT_CAPTURE_RESULT_EXTRA_DATA_SIZE
            ) {
                scrollTo(Math.max(captuerEdge, 0));
                return;
            }

            const prevScrollSize = prevScrollSizeRef.current;

            const blobUrl = URL.createObjectURL(new Blob([captureResult.thumbnail_buffer]));

            if (prevScrollSize.top_image_size < currentScrollSize.top_image_size) {
                setTopImageUrlList((prev) => [blobUrl, ...prev]);
                setTimeout(() => {
                    scrollTo(0);
                }, 100);
            } else {
                setBottomImageUrlList((prev) => [...prev, blobUrl]);
                setTimeout(() => {
                    scrollTo(
                        scrollDirectionRef.current === ScrollDirection.Horizontal
                            ? scrollRef.current!.scrollWidth
                            : scrollRef.current!.scrollHeight,
                    );
                }, 100);
            }
            prevScrollSizeRef.current = currentScrollSize;
        },
        [
            imageBufferRef,
            positionRectRef,
            scrollDirectionRef,
            scrollTo,
            setBottomImageUrlList,
            setTopImageUrlList,
        ],
    );

    const captureImage = useCallback(
        async (scrollImageList: ScrollImageList) => {
            setLoading(true);
            let captureResult: ScrollScreenshotCaptureResult;

            const rect = selectLayerActionRef.current!.getSelectRect()!;
            try {
                captureResult = await scrollScreenshotCapture(
                    scrollImageList,
                    imageBufferRef.current!.monitorX,
                    imageBufferRef.current!.monitorY,
                    rect.min_x,
                    rect.min_y,
                    rect.max_x,
                    rect.max_y,
                    THUMBNAIL_WIDTH * imageBufferRef.current!.monitorScaleFactor,
                );
            } catch (error) {
                console.error(error);
                message.error(intl.formatMessage({ id: 'draw.scrollScreenshot.captureError' }));
                return;
            }

            setLoading(false);

            if (captureResult.edge_position === undefined) {
                return;
            }

            updateImageUrlList(captureResult);
        },
        [imageBufferRef, intl, message, selectLayerActionRef, setLoading, updateImageUrlList],
    );
    const captuerDebounce = useMemo(() => {
        return debounce(captureImage, 83);
    }, [captureImage]);

    const init = useCallback(
        async (rect: ElementRect, direction: ScrollDirection) => {
            const scale = 1 / imageBufferRef.current!.monitorScaleFactor;
            setPositionRect({
                min_x: rect.min_x * scale,
                min_y: rect.min_y * scale,
                max_x: rect.max_x * scale,
                max_y: rect.max_y * scale,
            });

            const scrollSettings = getAppSettings()[AppSettingsGroup.SystemScrollScreenshot];
            const maxSide = Math.max(scrollSettings.maxSide, scrollSettings.minSide);

            try {
                await scrollScreenshotInit(
                    direction,
                    rect.max_x - rect.min_x,
                    rect.max_y - rect.min_y,
                    scrollSettings.sampleRate,
                    scrollSettings.minSide,
                    maxSide,
                    scrollSettings.imageFeatureThreshold,
                    scrollSettings.imageFeatureDescriptionLength,
                    scrollDirectionRef.current === ScrollDirection.Horizontal
                        ? Math.ceil((rect.max_x - rect.min_x) / 1.5)
                        : Math.ceil((rect.max_y - rect.min_y) / 1.5),
                );
            } catch (error) {
                console.error(error);
                message.error(intl.formatMessage({ id: 'draw.scrollScreenshot.initError' }));
                return;
            }

            enableScrollThroughRef.current = true;

            // 初始化成功后，自动截取第一个片段
            captureImage(ScrollImageList.Bottom);
        },
        [
            captureImage,
            getAppSettings,
            imageBufferRef,
            intl,
            message,
            scrollDirectionRef,
            setPositionRect,
        ],
    );

    const pendingScrollThroughRef = useRef<boolean>(false);
    const onWheel = useCallback<WheelEventHandler<HTMLDivElement>>(
        (event) => {
            if (!enableScrollThroughRef.current) {
                return;
            }

            if (pendingScrollThroughRef.current) {
                return;
            }

            if (scrollDirectionRef.current === ScrollDirection.Horizontal && !event.shiftKey) {
                return;
            }

            pendingScrollThroughRef.current = true;
            scrollThrough(event.deltaY > 0 ? 1 : -1).finally(() => {
                pendingScrollThroughRef.current = false;
            });

            if (loadingRef.current) {
                return;
            }

            console.log(event.deltaY);
            captuerDebounce(event.deltaY > 0 ? ScrollImageList.Bottom : ScrollImageList.Top);
        },
        [captuerDebounce, loadingRef, scrollDirectionRef],
    );

    const startCapture = useCallback(() => {
        setCaptuerEdgePosition(undefined);
        enableScrollThroughRef.current = false;
        releaseImageUrlList();
        prevScrollSizeRef.current = {
            top_image_size: 0,
            bottom_image_size: 0,
        };
        setPositionRect(undefined);

        const selectRect = selectLayerActionRef.current?.getSelectRect();
        if (!selectRect) {
            return;
        }

        init(selectRect, scrollDirectionRef.current);
    }, [releaseImageUrlList, selectLayerActionRef, init, scrollDirectionRef, setPositionRect]);
    useStateSubscriber(
        DrawStatePublisher,
        useCallback(
            (drawState: DrawState) => {
                if (drawState !== DrawState.ScrollScreenshot) {
                    setPositionRect(undefined);
                    return;
                }

                startCapture();
            },
            [setPositionRect, startCapture],
        ),
    );

    useEffect(() => {
        return () => {
            scrollScreenshotClear();
        };
    }, []);

    if (!positionRect) {
        return null;
    }

    const thumbnailHeight =
        scrollDirection === ScrollDirection.Horizontal
            ? (THUMBNAIL_WIDTH * (positionRect.max_x - positionRect.min_x)) /
              (positionRect.max_y - positionRect.min_y)
            : (THUMBNAIL_WIDTH * (positionRect.max_y - positionRect.min_y)) /
              (positionRect.max_x - positionRect.min_x);

    const thumbnailListTransform =
        scrollDirection === ScrollDirection.Horizontal
            ? `translate(${positionRect.min_x}px, ${positionRect.min_y - token.marginXXS - THUMBNAIL_WIDTH}px) rotateX(180deg)`
            : `translate(${positionRect.max_x + token.marginXXS}px, ${positionRect.min_y}px)`;

    return (
        <>
            <SubTools
                buttons={[
                    <Button
                        disabled={loading}
                        onClick={() => {
                            if (scrollDirectionRef.current === ScrollDirection.Horizontal) {
                                setScrollDirection(ScrollDirection.Vertical);
                            } else {
                                setScrollDirection(ScrollDirection.Horizontal);
                            }
                            startCapture();
                        }}
                        icon={<RotateIcon />}
                        title={intl.formatMessage({ id: 'draw.scrollScreenshot.changeDirection' })}
                        type={'text'}
                        key="rotate"
                    />,
                ]}
            />

            <div
                className="scroll-screenshot-tool-touch-area"
                style={{
                    transform: `translate(${positionRect.min_x}px, ${positionRect.min_y}px)`,
                }}
                onWheel={onWheel}
            >
                <div
                    style={{
                        width: positionRect.max_x - positionRect.min_x,
                        height: positionRect.max_y - positionRect.min_y,
                    }}
                />
            </div>

            <div
                className="thumbnail-list"
                style={{
                    transform: thumbnailListTransform,
                }}
                ref={scrollRef}
            >
                <div
                    className="thumbnail-list-content"
                    style={
                        scrollDirection === ScrollDirection.Horizontal
                            ? {
                                  width: positionRect.max_x - positionRect.min_x,
                                  height: THUMBNAIL_WIDTH,
                              }
                            : {
                                  width: THUMBNAIL_WIDTH,
                                  height: positionRect.max_y - positionRect.min_y,
                              }
                    }
                >
                    <div className="thumbnail-list-content-scroll-area">
                        {captuerEdgePosition !== undefined && (
                            <div className="captuer-edge-mask">
                                <div
                                    className="captuer-edge-mask-top"
                                    style={
                                        scrollDirection === ScrollDirection.Horizontal
                                            ? {
                                                  height: '100%',
                                                  width: captuerEdgePosition,
                                              }
                                            : {
                                                  height: captuerEdgePosition,
                                                  width: '100%',
                                              }
                                    }
                                />
                                <div
                                    style={
                                        scrollDirection === ScrollDirection.Horizontal
                                            ? {
                                                  height: '100%',
                                                  width: thumbnailHeight,
                                              }
                                            : {
                                                  height: thumbnailHeight,
                                                  width: '100%',
                                              }
                                    }
                                />
                                <div className="captuer-edge-mask-bottom" />
                            </div>
                        )}
                        {topImageUrlList.map((url) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className="thumbnail" key={url} src={url} alt="top" />
                        ))}
                        {bottomImageUrlList.map((url) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img className="thumbnail" key={url} src={url} alt="bottom" />
                        ))}
                    </div>
                </div>
            </div>

            <div
                style={{
                    transform: thumbnailListTransform,
                    position: 'fixed',
                    left: 0,
                    top: 0,
                }}
            >
                <Spin spinning={loading}>
                    <div
                        style={
                            scrollDirection === ScrollDirection.Horizontal
                                ? {
                                      width: positionRect.max_x - positionRect.min_x,
                                      height: THUMBNAIL_WIDTH,
                                  }
                                : {
                                      width: THUMBNAIL_WIDTH,
                                      height: positionRect.max_y - positionRect.min_y,
                                  }
                        }
                    />
                </Spin>
            </div>

            <style jsx>{`
                .scroll-screenshot-tool-touch-area {
                    position: fixed;
                    left: 0px;
                    top: 0px;
                    z-index: ${zIndexs.Draw_ScrollScreenshotThumbnail};
                    pointer-events: auto;
                }

                .scroll-screenshot-tool-touch-area-content {
                    width: 100%;
                    height: 100%;
                }

                .thumbnail-list {
                    width: ${scrollDirection === ScrollDirection.Horizontal
                        ? 'unset'
                        : `${THUMBNAIL_WIDTH + 5}px`};
                    height: ${scrollDirection === ScrollDirection.Horizontal
                        ? `${THUMBNAIL_WIDTH + 5}px`
                        : 'unset'};
                    position: fixed;
                    left: 0px;
                    top: ${scrollDirection === ScrollDirection.Horizontal ? '-5px' : '0px'};
                    overflow-y: ${scrollDirection === ScrollDirection.Horizontal
                        ? 'hidden'
                        : 'auto'};
                    overflow-x: ${scrollDirection === ScrollDirection.Horizontal
                        ? 'auto'
                        : 'hidden'};
                    pointer-events: auto;
                    box-sizing: border-box;
                }

                .thumbnail-list::-webkit-scrollbar {
                    width: 5px;
                    height: 5px;
                }

                .thumbnail-list::-webkit-scrollbar-thumb {
                    background-color: rgba(0, 0, 0, 0.2);
                    border-radius: 4px;
                }

                .thumbnail-list::-webkit-scrollbar-thumb:hover {
                    background-color: rgba(0, 0, 0, 0.4);
                }

                .thumbnail-list::-webkit-scrollbar-track {
                    background: transparent;
                    border-radius: 4px;
                }

                .thumbnail-list .thumbnail {
                    width: ${scrollDirection === ScrollDirection.Horizontal
                        ? 'unset'
                        : `${THUMBNAIL_WIDTH}px`};
                    height: ${scrollDirection === ScrollDirection.Horizontal
                        ? `${THUMBNAIL_WIDTH}px`
                        : 'unset'};
                }

                .thumbnail-list-content {
                    position: relative;
                }

                .thumbnail-list-content-scroll-area {
                    display: flex;
                    flex-direction: ${scrollDirection === ScrollDirection.Horizontal
                        ? 'row'
                        : 'column'};
                    position: relative;
                    ${scrollDirection === ScrollDirection.Horizontal
                        ? 'transform: rotateX(180deg);'
                        : ''}
                    width: fit-content;
                }

                .captuer-spin {
                    position: absolute;
                    left: 0px;
                    top: 0px;
                }

                .captuer-edge-mask {
                    display: flex;
                    flex-direction: ${scrollDirection === ScrollDirection.Horizontal
                        ? 'row'
                        : 'column'};
                    position: absolute;
                    width: 100%;
                    height: 100%;
                }

                .captuer-edge-mask-top {
                    display: block;
                    background: rgba(0, 0, 0, 0.32);
                    width: 100%;
                }

                .captuer-edge-mask-bottom {
                    display: block;
                    background: rgba(0, 0, 0, 0.32);
                    width: ${scrollDirection === ScrollDirection.Horizontal ? 'unset' : '100%'};
                    flex: 1;
                }
            `}</style>
        </>
    );
};
