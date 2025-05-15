'use client';

import { createContext, RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { ConfigProvider, theme } from 'antd';
import _, { trim } from 'lodash';
import zhCN from 'antd/es/locale/zh_CN';
import zhTW from 'antd/es/locale/zh_TW';
import enUS from 'antd/es/locale/en_US';
import { IntlProvider } from 'react-intl';
import { messages } from '@/messages/map';
import { ImageBuffer } from '@/commands';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow, Window as AppWindow } from '@tauri-apps/api/window';
import { AppFunction, AppFunctionConfig, defaultAppFunctionConfigs } from './extra';
import { createPublisher, withStatePublisher } from '@/hooks/useStatePublisher';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import {
    defaultDrawToolbarKeyEventSettings,
    KeyEventKey as DrawToolbarKeyEventKey,
    KeyEventValue as DrawToolbarKeyEventValue,
} from './draw/components/drawToolbar/components/keyEventWrap/extra';
import React from 'react';
import * as appAutostart from '@tauri-apps/plugin-autostart';
import { defaultKeyEventSettings, KeyEventKey, KeyEventValue } from '@/core/hotKeys';
import { TranslationDomain, TranslationType } from '@/services/tools/translation';
import { setEnableProxy } from '@/commands/core';
import { ChatApiConfig } from './settings/functionSettings/extra';

export enum AppSettingsGroup {
    Common = 'common',
    Cache = 'cache',
    Screenshot = 'screenshot',
    DrawToolbarKeyEvent = 'drawToolbarKeyEvent',
    KeyEvent = 'KeyEvent',
    AppFunction = 'appFunction',
    Render = 'render',
    SystemCommon = 'systemCommon',
    SystemChat = 'systemChat',
    SystemNetwork = 'systemNetwork',
    FunctionChat = 'functionChat',
}

export enum AppSettingsLanguage {
    ZHHans = 'zh-Hans',
    ZHHant = 'zh-Hant',
    EN = 'en',
}

export enum AppSettingsControlNode {
    Circle = 'circle',
    Polyline = 'polyline',
}

export type AppSettingsData = {
    [AppSettingsGroup.Common]: {
        darkMode: boolean;
        language: AppSettingsLanguage;
        /** 浏览器语言，用于自动切换语言 */
        browserLanguage: string;
    };
    [AppSettingsGroup.Screenshot]: {
        /** 选区控件样式 */
        controlNode: AppSettingsControlNode;
        /** 选取窗口子元素 */
        findChildrenElements: boolean;
    };
    [AppSettingsGroup.Cache]: {
        menuCollapsed: boolean;
        chatModel: string;
        translationType: TranslationType | string;
        translationDomain: TranslationDomain;
        targetLanguage: string;
    };
    [AppSettingsGroup.DrawToolbarKeyEvent]: Record<
        DrawToolbarKeyEventKey,
        DrawToolbarKeyEventValue
    >;
    [AppSettingsGroup.KeyEvent]: Record<KeyEventKey, KeyEventValue>;
    [AppSettingsGroup.AppFunction]: Record<AppFunction, AppFunctionConfig>;
    [AppSettingsGroup.Render]: {
        antialias: boolean;
    };
    [AppSettingsGroup.SystemCommon]: {
        autoStart: boolean;
    };
    [AppSettingsGroup.SystemChat]: {
        maxTokens: number;
        temperature: number;
        thinkingBudgetTokens: number;
    };
    [AppSettingsGroup.SystemNetwork]: {
        enableProxy: boolean;
    };
    [AppSettingsGroup.FunctionChat]: {
        autoCreateNewSession: boolean;
        chatApiConfigList: ChatApiConfig[];
    };
};

export const defaultAppSettingsData: AppSettingsData = {
    [AppSettingsGroup.Common]: {
        darkMode: false,
        language: AppSettingsLanguage.ZHHans,
        browserLanguage: '',
    },
    [AppSettingsGroup.Screenshot]: {
        controlNode: AppSettingsControlNode.Circle,
        findChildrenElements: true,
    },
    [AppSettingsGroup.Cache]: {
        menuCollapsed: false,
        chatModel: 'deepseek-reasoner',
        translationType: TranslationType.Youdao,
        translationDomain: TranslationDomain.General,
        targetLanguage: '',
    },
    [AppSettingsGroup.DrawToolbarKeyEvent]: defaultDrawToolbarKeyEventSettings,
    [AppSettingsGroup.KeyEvent]: defaultKeyEventSettings,
    [AppSettingsGroup.AppFunction]: defaultAppFunctionConfigs,
    [AppSettingsGroup.Render]: {
        antialias: true,
    },
    [AppSettingsGroup.SystemCommon]: {
        autoStart: true,
    },
    [AppSettingsGroup.SystemChat]: {
        maxTokens: 4096,
        temperature: 1,
        thinkingBudgetTokens: 4096,
    },
    [AppSettingsGroup.SystemNetwork]: {
        enableProxy: false,
    },
    [AppSettingsGroup.FunctionChat]: {
        autoCreateNewSession: true,
        chatApiConfigList: [],
    },
};

export type AppSettingsActionContextType = {
    updateAppSettings: (
        group: AppSettingsGroup,
        settings: Partial<AppSettingsData[typeof group]>,
        debounce: boolean,
        /** 是否保存到文件 */
        saveToFile: boolean,
        /** 是否同步到所有窗口 */
        syncAllWindow: boolean,
        /** 是否忽略状态更新 */
        ignoreState?: boolean,
        /** 是否忽略 publisher 更新 */
        ignorePublisher?: boolean,
    ) => void;
    reloadAppSettings: () => void;
};

export const AppSettingsActionContext = createContext<AppSettingsActionContextType>({
    updateAppSettings: () => {},
    reloadAppSettings: () => {},
});
export const AppSettingsPublisher = createPublisher<AppSettingsData>(defaultAppSettingsData);

export const AppSettingsLoadingPublisher = createPublisher<boolean>(true);

export type ScreenshotContextType = {
    imageBuffer: ImageBuffer | undefined;
    setImageBuffer: (imageBuffer: ImageBuffer | undefined) => void;
};

const configDir = 'configs';
const getFileName = (group: AppSettingsGroup) => {
    return `${configDir}\\${group}.json`;
};

export type AppContextType = {
    appWindowRef: RefObject<AppWindow | undefined>;
};

export const AppContext = createContext<AppContextType>({
    appWindowRef: { current: undefined },
});

const ContextWrapCore: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const appWindowRef = useRef<AppWindow>(undefined);
    useEffect(() => {
        appWindowRef.current = getCurrentWindow();
    }, []);

    const [appSettings, _setAppSettings] = useState<AppSettingsData>(defaultAppSettingsData);
    const appSettingsRef = useRef<AppSettingsData>(defaultAppSettingsData);
    const [, setAppSettingsStatePublisher] = useStateSubscriber(
        AppSettingsPublisher,
        useCallback((settings: AppSettingsData) => {
            document.body.className = settings[AppSettingsGroup.Common].darkMode
                ? 'app-dark'
                : 'app-light';
        }, []),
    );
    const [, setAppSettingsLoadingPublisher] = useStateSubscriber(
        AppSettingsLoadingPublisher,
        undefined,
    );
    const setAppSettings = useCallback(
        (newSettings: AppSettingsData, ignoreState?: boolean, ignorePublisher?: boolean) => {
            appSettingsRef.current = newSettings;
            if (!ignorePublisher) {
                setAppSettingsStatePublisher(newSettings);
            }
            if (!ignoreState) {
                _setAppSettings(newSettings);
            }
        },
        [_setAppSettings, setAppSettingsStatePublisher],
    );

    const writeAppSettings = useCallback(
        async (
            group: AppSettingsGroup,
            data: AppSettingsData[typeof group],
            syncAllWindow: boolean,
        ) => {
            await writeTextFile(getFileName(group), JSON.stringify(data), {
                baseDir: BaseDirectory.AppConfig,
            });
            if (syncAllWindow) {
                emit('reload-app-settings');
            }
        },
        [],
    );
    const writeAppSettingsDebounce = useCallback(
        (group: AppSettingsGroup, data: AppSettingsData[typeof group], syncAllWindow: boolean) => {
            _.debounce(() => writeAppSettings(group, data, syncAllWindow), 1000)();
        },
        [writeAppSettings],
    );

    const updateAppSettings = useCallback(
        (
            group: AppSettingsGroup,
            val: Partial<AppSettingsData[typeof group]> | string,
            debounce: boolean,
            /** 是否保存到文件 */
            saveToFile: boolean,
            /** 是否同步到所有窗口 */
            syncAllWindow: boolean,
            /** 是否忽略状态更新 */
            ignoreState?: boolean,
            /** 是否忽略 publisher 更新 */
            ignorePublisher?: boolean,
        ): AppSettingsData[typeof group] => {
            let newSettings: Partial<AppSettingsData[typeof group]>;
            if (typeof val === 'string') {
                try {
                    const parsedObj = JSON.parse(val);
                    newSettings =
                        typeof parsedObj === 'object' ? parsedObj : defaultAppSettingsData[group];
                } catch {
                    newSettings = defaultAppSettingsData[group];
                }
            } else {
                newSettings = val;
            }

            let settings: AppSettingsData[typeof group];

            if (group === AppSettingsGroup.Common) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;
                settings = {
                    darkMode:
                        typeof newSettings?.darkMode === 'boolean'
                            ? newSettings.darkMode
                            : (prevSettings?.darkMode ?? false),
                    language: (() => {
                        switch (newSettings?.language) {
                            case 'zh-Hans':
                                return AppSettingsLanguage.ZHHans;
                            case 'zh-Hant':
                                return AppSettingsLanguage.ZHHant;
                            case 'en':
                                return AppSettingsLanguage.EN;
                            default:
                                return prevSettings?.language ?? AppSettingsLanguage.EN;
                        }
                    })(),
                    browserLanguage:
                        typeof newSettings?.browserLanguage === 'string'
                            ? newSettings.browserLanguage
                            : (prevSettings?.browserLanguage ?? ''),
                };

                window.__APP_ACCEPT_LANGUAGE__ = settings.language.startsWith('en')
                    ? 'en-US'
                    : 'zh-CN';
            } else if (group === AppSettingsGroup.Cache) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;
                settings = {
                    menuCollapsed:
                        typeof newSettings?.menuCollapsed === 'boolean'
                            ? newSettings.menuCollapsed
                            : (prevSettings?.menuCollapsed ?? false),
                    chatModel:
                        typeof newSettings?.chatModel === 'string'
                            ? newSettings.chatModel
                            : (prevSettings?.chatModel ?? 'deepseek-reasoner'),
                    translationType:
                        typeof newSettings?.translationType === 'number' ||
                        typeof newSettings?.translationType === 'string'
                            ? newSettings.translationType
                            : (prevSettings?.translationType ?? TranslationType.Youdao),
                    translationDomain:
                        typeof newSettings?.translationDomain === 'string'
                            ? newSettings.translationDomain
                            : (prevSettings?.translationDomain ?? TranslationDomain.General),
                    targetLanguage:
                        typeof newSettings?.targetLanguage === 'string'
                            ? newSettings.targetLanguage
                            : (prevSettings?.targetLanguage ?? ''),
                };
            } else if (group === AppSettingsGroup.Screenshot) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                let controlNode = prevSettings?.controlNode ?? AppSettingsControlNode.Polyline;
                if (newSettings?.controlNode) {
                    if (newSettings.controlNode === AppSettingsControlNode.Circle) {
                        controlNode = AppSettingsControlNode.Circle;
                    } else if (newSettings.controlNode === AppSettingsControlNode.Polyline) {
                        controlNode = AppSettingsControlNode.Polyline;
                    }
                }

                const findChildrenElements =
                    typeof newSettings?.findChildrenElements === 'boolean'
                        ? newSettings.findChildrenElements
                        : (prevSettings?.findChildrenElements ??
                          defaultAppSettingsData[group].findChildrenElements);

                settings = {
                    controlNode,
                    findChildrenElements,
                };
            } else if (group === AppSettingsGroup.DrawToolbarKeyEvent) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                const settingsKeySet = new Set<string>();
                const settingKeys: DrawToolbarKeyEventKey[] = Object.keys(
                    defaultDrawToolbarKeyEventSettings,
                ) as DrawToolbarKeyEventKey[];
                settingKeys.forEach((key) => {
                    const keyEventSettings = newSettings as Record<
                        DrawToolbarKeyEventKey,
                        DrawToolbarKeyEventValue
                    >;

                    let keyEventSettingsKey =
                        typeof keyEventSettings[key]?.hotKey === 'string'
                            ? keyEventSettings[key].hotKey
                            : (prevSettings?.[key]?.hotKey ??
                              defaultDrawToolbarKeyEventSettings[key].hotKey);

                    // 格式化处理下
                    keyEventSettingsKey = keyEventSettingsKey
                        .split(',')
                        .map(trim)
                        .filter((val) => {
                            if (settingsKeySet.has(val)) {
                                return false;
                            }

                            if (defaultDrawToolbarKeyEventSettings[key].unique) {
                                settingsKeySet.add(val);
                            }

                            return true;
                        })
                        .join(', ');

                    keyEventSettings[key] = {
                        hotKey: keyEventSettingsKey,
                    };
                });

                settings = {
                    ...defaultDrawToolbarKeyEventSettings,
                    ...newSettings,
                };
            } else if (group === AppSettingsGroup.KeyEvent) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                const settingsKeySet = new Set<string>();
                const settingKeys: KeyEventKey[] = Object.keys(
                    defaultKeyEventSettings,
                ) as KeyEventKey[];
                settingKeys.forEach((key) => {
                    const keyEventSettings = newSettings as Record<KeyEventKey, KeyEventValue>;

                    let keyEventSettingsKey =
                        typeof keyEventSettings[key]?.hotKey === 'string'
                            ? keyEventSettings[key].hotKey
                            : (prevSettings?.[key]?.hotKey ?? defaultKeyEventSettings[key].hotKey);

                    // 格式化处理下
                    keyEventSettingsKey = keyEventSettingsKey
                        .split(',')
                        .map(trim)
                        .filter((val) => {
                            if (settingsKeySet.has(val)) {
                                return false;
                            }

                            if (defaultKeyEventSettings[key].unique) {
                                settingsKeySet.add(val);
                            }

                            return true;
                        })
                        .join(', ');

                    keyEventSettings[key] = {
                        hotKey: keyEventSettingsKey,
                        group: defaultKeyEventSettings[key].group,
                    };
                });

                settings = {
                    ...defaultDrawToolbarKeyEventSettings,
                    ...newSettings,
                };
            } else if (group === AppSettingsGroup.AppFunction) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                const settingsKeySet = new Set<string>();
                const settingKeys: AppFunction[] = Object.keys(
                    defaultAppFunctionConfigs,
                ) as AppFunction[];
                settingKeys.forEach((key) => {
                    const keyEventSettings = newSettings as Record<AppFunction, AppFunctionConfig>;

                    let keyEventSettingsKey =
                        typeof keyEventSettings[key]?.shortcutKey === 'string'
                            ? keyEventSettings[key].shortcutKey
                            : (prevSettings?.[key]?.shortcutKey ??
                              defaultAppFunctionConfigs[key].shortcutKey);

                    // 格式化处理下
                    keyEventSettingsKey = keyEventSettingsKey
                        .split(',')
                        .slice(0, 1) // 快捷键不支持多个键，这里也限制下
                        .map(trim)
                        .filter((val) => {
                            if (settingsKeySet.has(val)) {
                                return false;
                            }

                            return true;
                        })
                        .join(', ');

                    settingsKeySet.add(keyEventSettingsKey);

                    keyEventSettings[key] = {
                        shortcutKey: keyEventSettingsKey,
                        group: defaultAppFunctionConfigs[key].group,
                    };
                });

                settings = {
                    ...defaultAppFunctionConfigs,
                    ...newSettings,
                };
            } else if (group === AppSettingsGroup.Render) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                settings = {
                    antialias:
                        typeof newSettings?.antialias === 'boolean'
                            ? newSettings.antialias
                            : (prevSettings?.antialias ?? defaultAppSettingsData[group].antialias),
                };
            } else if (group === AppSettingsGroup.SystemCommon) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                settings = {
                    autoStart:
                        typeof newSettings?.autoStart === 'boolean'
                            ? newSettings.autoStart
                            : (prevSettings?.autoStart ?? defaultAppSettingsData[group].autoStart),
                };

                if (process.env.NODE_ENV === 'development') {
                }

                if (saveToFile && process.env.NODE_ENV !== 'development') {
                    (async () => {
                        // 每次启动都重新注册一下
                        await appAutostart.enable();
                        if (settings.autoStart) {
                            // await appAutostart.enable();
                        } else {
                            await appAutostart.disable();
                        }
                    })();
                }
            } else if (group === AppSettingsGroup.SystemChat) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                settings = {
                    maxTokens:
                        typeof newSettings?.maxTokens === 'number'
                            ? Math.min(Math.max(newSettings.maxTokens, 512), 8192)
                            : (prevSettings?.maxTokens ?? defaultAppSettingsData[group].maxTokens),
                    temperature:
                        typeof newSettings?.temperature === 'number'
                            ? Math.min(Math.max(newSettings.temperature, 0), 2)
                            : (prevSettings?.temperature ??
                              defaultAppSettingsData[group].temperature),
                    thinkingBudgetTokens:
                        typeof newSettings?.thinkingBudgetTokens === 'number'
                            ? Math.min(Math.max(newSettings.thinkingBudgetTokens, 1024), 8192)
                            : (prevSettings?.thinkingBudgetTokens ??
                              defaultAppSettingsData[group].thinkingBudgetTokens),
                };
            } else if (group === AppSettingsGroup.SystemNetwork) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                settings = {
                    enableProxy:
                        typeof newSettings?.enableProxy === 'boolean'
                            ? newSettings.enableProxy
                            : (prevSettings?.enableProxy ??
                              defaultAppSettingsData[group].enableProxy),
                };

                if (saveToFile) {
                    setEnableProxy(settings.enableProxy);
                }
            } else if (group === AppSettingsGroup.FunctionChat) {
                newSettings = newSettings as AppSettingsData[typeof group];
                const prevSettings = appSettingsRef.current[group] as
                    | AppSettingsData[typeof group]
                    | undefined;

                settings = {
                    autoCreateNewSession:
                        typeof newSettings?.autoCreateNewSession === 'boolean'
                            ? newSettings.autoCreateNewSession
                            : (prevSettings?.autoCreateNewSession ??
                              defaultAppSettingsData[group].autoCreateNewSession),
                    chatApiConfigList: Array.isArray(newSettings?.chatApiConfigList)
                        ? newSettings.chatApiConfigList.map((item) => ({
                              api_uri: `${item.api_uri ?? ''}`,
                              api_key: `${item.api_key ?? ''}`,
                              api_model: `${item.api_model ?? ''}`,
                              model_name: `${item.model_name ?? ''}`,
                              support_thinking: !!item.support_thinking,
                          }))
                        : (prevSettings?.chatApiConfigList ??
                          defaultAppSettingsData[group].chatApiConfigList),
                };
            } else {
                return defaultAppSettingsData[group];
            }

            setAppSettings(
                {
                    ...appSettingsRef.current,
                    [group]: settings,
                },
                ignoreState,
                ignorePublisher,
            );

            if (saveToFile) {
                if (debounce) {
                    writeAppSettingsDebounce(group, settings, syncAllWindow);
                } else {
                    writeAppSettings(group, settings, syncAllWindow);
                }
            }

            return settings;
        },
        [writeAppSettings, writeAppSettingsDebounce, setAppSettings],
    );

    const reloadAppSettings = useCallback(async () => {
        setAppSettingsLoadingPublisher(true);

        const groups = Object.keys(defaultAppSettingsData).filter(
            (group) => group in defaultAppSettingsData,
        );

        const settings: AppSettingsData = {} as AppSettingsData;
        for (const group of groups as AppSettingsGroup[]) {
            // 启动时验证下目录是否存在
            let isDirExists = await exists('', {
                baseDir: BaseDirectory.AppConfig,
            });
            if (!isDirExists) {
                await mkdir('', {
                    baseDir: BaseDirectory.AppConfig,
                });
            }

            isDirExists = await exists(configDir, {
                baseDir: BaseDirectory.AppConfig,
            });
            if (!isDirExists) {
                await mkdir(configDir, {
                    baseDir: BaseDirectory.AppConfig,
                });
            }

            const isFileExists = await exists(getFileName(group), {
                baseDir: BaseDirectory.AppConfig,
            });

            const saveToFile = appWindowRef.current?.label === 'main';

            if (!isFileExists) {
                settings[group] = updateAppSettings(
                    group,
                    defaultAppSettingsData[group],
                    false,
                    saveToFile,
                    false,
                    true,
                    true,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ) as any;
                continue;
            }

            const content = await readTextFile(getFileName(group), {
                baseDir: BaseDirectory.AppConfig,
            });

            settings[group] = updateAppSettings(
                group,
                content,
                false,
                saveToFile,
                false,
                true,
                true,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ) as any;
        }

        if (_.isEqual(appSettingsRef.current, settings)) {
            setAppSettings(settings);
        }

        setAppSettingsLoadingPublisher(false);
    }, [setAppSettingsLoadingPublisher, updateAppSettings, setAppSettings]);

    const initLoading = useRef(false);
    useEffect(() => {
        if (initLoading.current) {
            return;
        }

        initLoading.current = true;
        reloadAppSettings().finally(() => {
            initLoading.current = false;
        });
    }, [reloadAppSettings]);

    const [, antdLocale] = useMemo(() => {
        const language = appSettings[AppSettingsGroup.Common].language;
        switch (language) {
            case AppSettingsLanguage.ZHHans:
                return ['zh-CN', zhCN];
            case AppSettingsLanguage.ZHHant:
                return ['zh-TW', zhTW];
            default:
                return ['en-US', enUS];
        }
    }, [appSettings]);

    const appSettingsContextValue = useMemo(() => {
        return {
            ...appSettings,
            updateAppSettings,
            reloadAppSettings,
        };
    }, [appSettings, updateAppSettings, reloadAppSettings]);

    const appContextValue = useMemo(() => {
        return {
            appWindowRef,
        };
    }, [appWindowRef]);

    return (
        <AppSettingsActionContext.Provider value={appSettingsContextValue}>
            <ConfigProvider
                theme={{
                    algorithm: appSettings[AppSettingsGroup.Common].darkMode
                        ? theme.darkAlgorithm
                        : theme.defaultAlgorithm,
                }}
                locale={antdLocale}
            >
                <IntlProvider
                    locale={appSettings[AppSettingsGroup.Common].language}
                    messages={messages[appSettings[AppSettingsGroup.Common].language]}
                    defaultLocale={AppSettingsLanguage.ZHHans}
                >
                    <AppContext.Provider value={appContextValue}>{children}</AppContext.Provider>
                </IntlProvider>
            </ConfigProvider>
        </AppSettingsActionContext.Provider>
    );
};

export const ContextWrap = React.memo(
    withStatePublisher(
        withStatePublisher(ContextWrapCore, AppSettingsPublisher),
        AppSettingsLoadingPublisher,
    ),
);
