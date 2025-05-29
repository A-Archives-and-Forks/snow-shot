import {
    serviceBaseFetch,
    serviceFetch,
    ServiceResponse,
    streamFetch,
    StreamFetchEventOptions,
} from '.';

export enum TranslationType {
    Youdao = 0,
    DeepSeek = 1,
    QwenTurbo = 2,
    QwenPlus = 3,
    QwenMax = 4,
}

export enum TranslationDomain {
    General = 'general',
    Computers = 'computers',
    Medicine = 'medicine',
    Finance = 'finance',
    Game = 'game',
}

export interface TranslateParams {
    /**
     * 需要翻译的内容
     */
    content: string;
    /**
     * 源语言
     */
    from: string;
    /**
     * 目标语言
     */
    to: string;
    /**
     * 领域
     */
    domain: TranslationDomain;
    /**
     * 翻译类型
     */
    type: TranslationType;
}

export interface TranslateData {
    /**
     * 翻译后的内容
     */
    delta_content: string;
    /**
     * 源语言
     */
    from?: string;
    /**
     * 目标语言
     */
    to?: string;
}

export const translate = async (
    options: StreamFetchEventOptions<TranslateData>,
    params: TranslateParams,
) => {
    return streamFetch<TranslateData>('/api/v1/translation/translate', {
        method: 'POST',
        data: params,
        ...options,
    });
};

export type TranslationTypeOption = {
    type: TranslationType;
    name: string;
};

export const getTranslationTypes = async () => {
    return serviceFetch<TranslationTypeOption[]>('/api/v1/translation/types', {
        method: 'GET',
    });
};

export type DeepLTranslateResult = {
    translations: {
        detected_source_language: string;
        text: string;
    }[];
};

export const translateTextDeepL = async (
    apiUri: string,
    apiKey: string,
    sourceContent: string[],
    sourceLanguage: string | null,
    targetLanguage: string,
    preferQualityOptimized: boolean,
): Promise<DeepLTranslateResult | undefined> => {
    const response = await serviceBaseFetch(apiUri, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `DeepL-Auth-Key ${apiKey}`,
        },
        data: {
            text: sourceContent,
            source_lang: sourceLanguage,
            target_lang: targetLanguage,
            preserve_formatting: true,
            model_type: preferQualityOptimized ? 'prefer_quality_optimized' : 'latency_optimized',
        },
    });

    if (response instanceof ServiceResponse) {
        response.success();
        return undefined;
    }

    return (await response.json()) as DeepLTranslateResult;
};

export type GoogleWebTranslateResult = {
    sentences: {
        trans: string;
        orig: string;
    }[];
    src: string;
    confidence: number;
};

export const translateTextGoogleWeb = async (
    sourceContent: string,
    sourceLanguage: string,
    targetLanguage: string,
): Promise<GoogleWebTranslateResult | undefined> => {
    const response = await serviceBaseFetch(`https://translate.google.com/translate_a/single`, {
        method: 'GET',
        params: {
            client: 'gtx',
            dt: 't',
            dj: '1',
            sl: sourceLanguage,
            tl: targetLanguage,
            q: sourceContent,
        },
    });

    if (response instanceof ServiceResponse) {
        response.success();
        return undefined;
    }

    return (await response.json()) as GoogleWebTranslateResult;
};
