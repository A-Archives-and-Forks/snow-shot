import { ButtonProps } from 'antd';
import { FormattedMessage } from 'react-intl';

export enum AppFunction {
    Screenshot = 'screenshot',
    ScreenshotFixed = 'screenshotFixed',
    ScreenshotOcr = 'screenshotOcr',
    Chat = 'chat',
    ChatSelectText = 'chatSelectText',
    Translation = 'translation',
    TranslationSelectText = 'translationSelectText',
    TopWindow = 'topWindow',
}

export enum AppFunctionGroup {
    Screenshot = 'screenshot',
    Translation = 'translation',
    Chat = 'chat',
    Other = 'other',
}

export type AppFunctionConfig = {
    shortcutKey: string;
    group: AppFunctionGroup;
};

export type AppFunctionComponentConfig = AppFunctionConfig & {
    configKey: AppFunction;
    title: React.ReactNode;
    icon?: React.ReactNode;
    group: AppFunctionGroup;
    onClick: () => Promise<void>;
    onKeyChange: (value: string, prevValue: string) => Promise<boolean>;
};

export const defaultAppFunctionConfigs: Record<AppFunction, AppFunctionConfig> = {
    [AppFunction.Screenshot]: {
        shortcutKey: 'F1',
        group: AppFunctionGroup.Screenshot,
    },
    [AppFunction.ScreenshotFixed]: {
        shortcutKey: 'Ctrl+Alt+F',
        group: AppFunctionGroup.Screenshot,
    },
    [AppFunction.ScreenshotOcr]: {
        shortcutKey: 'Ctrl+Alt+D',
        group: AppFunctionGroup.Screenshot,
    },
    [AppFunction.ChatSelectText]: {
        shortcutKey: 'F3',
        group: AppFunctionGroup.Chat,
    },
    [AppFunction.Chat]: {
        shortcutKey: 'Ctrl+Alt+C',
        group: AppFunctionGroup.Chat,
    },
    [AppFunction.TranslationSelectText]: {
        shortcutKey: 'F4',
        group: AppFunctionGroup.Translation,
    },
    [AppFunction.Translation]: {
        shortcutKey: 'Ctrl+Alt+T',
        group: AppFunctionGroup.Translation,
    },
    [AppFunction.TopWindow]: {
        shortcutKey: 'Ctrl+Alt+W',
        group: AppFunctionGroup.Other,
    },
};

export enum ShortcutKeyStatus {
    Registered = 'registered',
    Unregistered = 'unregistered',
    Error = 'error',
}

export const convertShortcutKeyStatusToButtonColor = (
    status: ShortcutKeyStatus | undefined,
): ButtonProps['color'] => {
    if (status === undefined) {
        return 'danger';
    }

    switch (status) {
        case ShortcutKeyStatus.Registered:
            return 'green';
        case ShortcutKeyStatus.Unregistered:
            return 'orange';
        case ShortcutKeyStatus.Error:
            return 'danger';
        default:
            return 'default';
    }
};

export const convertShortcutKeyStatusToTip = (
    status: ShortcutKeyStatus | undefined,
): React.ReactNode | undefined => {
    if (status === undefined || status === ShortcutKeyStatus.Registered) {
        return undefined;
    }

    switch (status) {
        case ShortcutKeyStatus.Unregistered:
            return <FormattedMessage id="home.shortcut.unregistered" />;
        case ShortcutKeyStatus.Error:
            return <FormattedMessage id="home.shortcut.error" />;
        default:
            return undefined;
    }
};
