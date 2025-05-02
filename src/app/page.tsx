'use client';

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { FormattedMessage } from 'react-intl';
import { Space, Spin, Tooltip } from 'antd';
import { ContentWrap } from '@/components/contentWrap';
import {
    FixedIcon,
    OcrDetectIcon,
    ScreenshotIcon,
    SelectTextIcon,
    TranslationIcon,
} from '@/components/icons';
import { FunctionButton } from '@/components/functionButton';
import { executeScreenshot, ScreenshotType } from '@/functions/screenshot';
import {
    isRegistered,
    register,
    unregister,
    unregisterAll,
} from '@tauri-apps/plugin-global-shortcut';
import { KeyButton } from '@/components/keyButton';
import {
    AppSettingsActionContext,
    AppSettingsData,
    AppSettingsGroup,
    AppSettingsPublisher,
} from './contextWrap';
import { InfoCircleOutlined } from '@ant-design/icons';
import { useAppSettingsLoad } from '@/hooks/useAppSettingsLoad';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import {
    AppFunction,
    AppFunctionComponentConfig,
    AppFunctionConfig,
    AppFunctionGroup,
    convertShortcutKeyStatusToButtonColor,
    convertShortcutKeyStatusToTip,
    defaultAppFunctionConfigs,
    ShortcutKeyStatus,
} from './extra';
import { autoStartHideWindow } from '@/commands';
import { useRouter } from 'next/navigation';
import { GroupTitle } from '@/components/groupTitle';
import { theme } from 'antd';
import { showWindow } from '@/utils/window';

export default function Home() {
    const { token } = theme.useToken();
    const router = useRouter();

    const disableShortcutKeyRef = useRef(false);
    const {
        configs: defaultAppFunctionComponentConfigs,
        groupConfigs: defaultAppFunctionComponentGroupConfigs,
    }: {
        configs: Record<AppFunction, AppFunctionComponentConfig>;
        groupConfigs: Record<AppFunctionGroup, AppFunctionComponentConfig[]>;
    } = useMemo(() => {
        const configs = Object.keys(defaultAppFunctionConfigs).reduce(
            (configs, key) => {
                let buttonTitle;
                let buttonIcon;
                let buttonOnClick;
                switch (key) {
                    case AppFunction.ScreenshotFixed:
                        buttonTitle = (
                            <FormattedMessage
                                id="home.screenshotAfter"
                                values={{
                                    text: <FormattedMessage id="draw.fixedTool" />,
                                }}
                            />
                        );
                        buttonIcon = <FixedIcon style={{ fontSize: '1.2em' }} />;
                        buttonOnClick = () => executeScreenshot(ScreenshotType.Fixed);
                        break;
                    case AppFunction.ScreenshotOcr:
                        buttonTitle = (
                            <FormattedMessage
                                id="home.screenshotAfter"
                                values={{
                                    text: <FormattedMessage id="draw.ocrDetectTool" />,
                                }}
                            />
                        );
                        buttonIcon = <OcrDetectIcon />;
                        buttonOnClick = () => executeScreenshot(ScreenshotType.OcrDetect);
                        break;
                    case AppFunction.TranslationSelectText:
                        buttonTitle = <FormattedMessage id="home.translationSelectText" />;
                        buttonIcon = <SelectTextIcon style={{ fontSize: '1em' }} />;
                        buttonOnClick = async () => {
                            showWindow(true);
                            router.push(`/tools/translation?type=selectText&t=${Date.now()}`);
                        };
                        break;
                    case AppFunction.Translation:
                        buttonTitle = <FormattedMessage id="home.translation" />;
                        buttonIcon = <TranslationIcon />;
                        buttonOnClick = () => {
                            showWindow();
                            router.push('/tools/translation');
                        };
                        break;
                    case AppFunction.Screenshot:
                    default:
                        buttonTitle = <FormattedMessage id="home.screenshot" />;
                        buttonIcon = <ScreenshotIcon />;
                        buttonOnClick = () => executeScreenshot();
                        break;
                }

                const onClick = async () => {
                    if (disableShortcutKeyRef.current) {
                        return;
                    }

                    await buttonOnClick();
                };
                configs[key as AppFunction] = {
                    ...defaultAppFunctionConfigs[key as AppFunction],
                    configKey: key as AppFunction,
                    title: buttonTitle,
                    icon: buttonIcon,
                    onClick,
                    onKeyChange: async (value: string, prevValue: string) => {
                        if (!value) {
                            return false;
                        }

                        if (prevValue) {
                            if (await isRegistered(prevValue)) {
                                await unregister(prevValue);
                            }
                        }

                        if (await isRegistered(value)) {
                            return false;
                        }

                        try {
                            await register(value, (event) => {
                                if (event.state !== 'Released') {
                                    return;
                                }

                                onClick();
                            });
                        } catch (error) {
                            // 将错误传给组件，组件捕获错误来判断快捷键状态
                            throw error;
                        }

                        return true;
                    },
                };

                return configs;
            },
            {} as Record<AppFunction, AppFunctionComponentConfig>,
        );

        const groupConfigs = Object.values(configs).reduce(
            (groupConfigs, config) => {
                if (!groupConfigs[config.group]) {
                    groupConfigs[config.group] = [];
                }

                groupConfigs[config.group].push(config);
                return groupConfigs;
            },
            {} as Record<AppFunctionGroup, AppFunctionComponentConfig[]>,
        );

        return { configs, groupConfigs };
    }, [router]);

    const [shortcutKeyStatus, setShortcutKeyStatus] =
        useState<Record<AppFunction, ShortcutKeyStatus>>();

    const [updateShortcutKeyStatusLoading, setUpdateShortcutKeyStatusLoading] = useState(true);
    const previousAppFunctionSettingsRef =
        useRef<AppSettingsData[AppSettingsGroup.AppFunction]>(undefined);

    const appFunctionComponentConfigsKeys = useMemo(
        () => Object.keys(defaultAppFunctionComponentConfigs),
        [defaultAppFunctionComponentConfigs],
    );

    const updateShortcutKeyStatus = useCallback(
        async (settings: Record<AppFunction, AppFunctionConfig>) => {
            setUpdateShortcutKeyStatusLoading(true);
            const keyStatus: Record<AppFunction, ShortcutKeyStatus> = {} as Record<
                AppFunction,
                ShortcutKeyStatus
            >;
            await Promise.all(
                appFunctionComponentConfigsKeys.map(async (key) => {
                    const config = defaultAppFunctionComponentConfigs[key as AppFunction];
                    try {
                        const isSuccess = await config.onKeyChange(
                            settings[key as AppFunction].shortcutKey,
                            (previousAppFunctionSettingsRef.current ?? settings)[key as AppFunction]
                                .shortcutKey,
                        );
                        keyStatus[key as AppFunction] = isSuccess
                            ? ShortcutKeyStatus.Registered
                            : ShortcutKeyStatus.Unregistered;
                    } catch {
                        keyStatus[key as AppFunction] = ShortcutKeyStatus.Error;
                    }
                }),
            );

            setShortcutKeyStatus(keyStatus);
            previousAppFunctionSettingsRef.current = settings;
            setUpdateShortcutKeyStatusLoading(false);
        },
        [appFunctionComponentConfigsKeys, defaultAppFunctionComponentConfigs],
    );

    const [appSettingsLoading, setAppSettingsLoading] = useState(true);
    const { updateAppSettings } = useContext(AppSettingsActionContext);
    const [appFunctionSettings, setAppFunctionSettings] =
        useState<AppSettingsData[AppSettingsGroup.AppFunction]>();
    useAppSettingsLoad(
        useCallback(() => {
            unregisterAll().then(() => {
                setAppSettingsLoading(false);
            });
        }, []),
    );

    useStateSubscriber(
        AppSettingsPublisher,
        useCallback((settings: AppSettingsData) => {
            setAppFunctionSettings(settings[AppSettingsGroup.AppFunction]);
        }, []),
    );

    useEffect(() => {
        if (appSettingsLoading) {
            return;
        }

        if (!appFunctionSettings) {
            return;
        }

        updateShortcutKeyStatus(appFunctionSettings);
    }, [appFunctionSettings, appSettingsLoading, updateShortcutKeyStatus]);

    useEffect(() => {
        if (!window.__APP_AUTO_START_HIDE_WINDOW__) {
            autoStartHideWindow();
            window.__APP_AUTO_START_HIDE_WINDOW__ = true;
        }
    }, []);

    return (
        <ContentWrap className="home-wrap">
            {Object.keys(defaultAppFunctionComponentGroupConfigs).map((group) => {
                const configs = defaultAppFunctionComponentGroupConfigs[group as AppFunctionGroup];

                let groupTitle;
                switch (group) {
                    case AppFunctionGroup.Screenshot:
                        groupTitle = (
                            <GroupTitle id="screenshotFunction">
                                <FormattedMessage
                                    id="home.screenshotFunction"
                                    key="screenshotFunction"
                                />
                            </GroupTitle>
                        );
                        break;
                    case AppFunctionGroup.Translation:
                        groupTitle = (
                            <GroupTitle id="translationFunction">
                                <FormattedMessage
                                    id="home.translationFunction"
                                    key="translationFunction"
                                />
                            </GroupTitle>
                        );
                        break;
                }

                return (
                    <div key={`${group}`} style={{ marginBottom: token.marginLG }}>
                        {groupTitle}
                        <Spin
                            key={`${group}`}
                            spinning={updateShortcutKeyStatusLoading || appSettingsLoading}
                        >
                            <Space direction="vertical" size="middle" style={{ display: 'flex' }}>
                                {configs.map((config) => {
                                    const key = config.configKey;
                                    const statusColor = appSettingsLoading
                                        ? undefined
                                        : convertShortcutKeyStatusToButtonColor(
                                              shortcutKeyStatus?.[key as AppFunction],
                                          );
                                    const statusTip = appSettingsLoading
                                        ? undefined
                                        : convertShortcutKeyStatusToTip(
                                              shortcutKeyStatus?.[key as AppFunction],
                                          );
                                    const currentShortcutKey =
                                        appFunctionSettings?.[key as AppFunction]?.shortcutKey;

                                    return (
                                        <div key={`${group}-${key}`}>
                                            <FunctionButton
                                                label={config.title}
                                                icon={config.icon}
                                                onClick={config.onClick}
                                            >
                                                <KeyButton
                                                    title={config.title}
                                                    maxWidth={128}
                                                    keyValue={currentShortcutKey ?? ''}
                                                    buttonProps={{
                                                        variant: 'outlined',
                                                        color: statusColor,
                                                        children: statusTip ? (
                                                            <Tooltip
                                                                title={convertShortcutKeyStatusToTip(
                                                                    shortcutKeyStatus?.[
                                                                        key as AppFunction
                                                                    ],
                                                                )}
                                                            >
                                                                <InfoCircleOutlined />
                                                            </Tooltip>
                                                        ) : (
                                                            <></>
                                                        ),
                                                        onClick: () => {
                                                            disableShortcutKeyRef.current = true;
                                                        },
                                                    }}
                                                    onCancel={() => {
                                                        disableShortcutKeyRef.current = false;
                                                    }}
                                                    onKeyChange={async (value) => {
                                                        disableShortcutKeyRef.current = false;
                                                        updateAppSettings(
                                                            AppSettingsGroup.AppFunction,
                                                            {
                                                                [key as AppFunction]: {
                                                                    ...appFunctionSettings,
                                                                    shortcutKey: value,
                                                                },
                                                            },
                                                            false,
                                                            true,
                                                            false,
                                                            false,
                                                        );
                                                    }}
                                                    maxLength={1}
                                                />
                                            </FunctionButton>
                                        </div>
                                    );
                                })}
                            </Space>
                        </Spin>
                    </div>
                );
            })}

            <style jsx>{`
                .home-wrap {
                }
            `}</style>
        </ContentWrap>
    );
}
