import { useCallback, useRef, useState } from 'react';
import { SubTools } from '../../subTools';
import { useStateSubscriber } from '@/hooks/useStateSubscriber';
import { DrawState } from '@/app/draw/types';
import {
    DrawEvent,
    DrawEventParams,
    DrawEventPublisher,
    DrawStatePublisher,
} from '@/app/draw/extra';
import { Button } from 'antd';
import { OcrDetectResult } from '@/commands/ocr';
import { OcrTranslateIcon } from '@/components/icons';
import { useIntl } from 'react-intl';
import { ModalTranslator, ModalTranslatorActionType } from './components/modalTranslator';

const OcrTool: React.FC<{
    onReplace: (result: OcrDetectResult) => void;
}> = ({ onReplace }) => {
    const intl = useIntl();

    const modalTranslatorActionRef = useRef<ModalTranslatorActionType>(undefined);

    const [enabled, setEnabled] = useState(false);
    const [ocrResult, setOcrResult] = useState<OcrDetectResult>();

    useStateSubscriber(
        DrawStatePublisher,
        useCallback((drawState: DrawState) => {
            if (drawState === DrawState.OcrDetect) {
                setEnabled(true);
            } else {
                setEnabled(false);
                setOcrResult(undefined);
            }
        }, []),
    );
    useStateSubscriber(
        DrawEventPublisher,
        useCallback((drawEvent: DrawEventParams) => {
            if (drawEvent?.event === DrawEvent.OcrDetect) {
                setOcrResult(drawEvent.params.result);
            }
        }, []),
    );

    if (!enabled) {
        return null;
    }

    return (
        <>
            <SubTools
                buttons={[
                    <Button
                        disabled={!ocrResult}
                        onClick={() => {
                            modalTranslatorActionRef.current?.startTranslate();
                        }}
                        icon={<OcrTranslateIcon />}
                        title={intl.formatMessage({ id: 'draw.ocrDetect.translate' })}
                        type={'text'}
                        key="translate"
                    />,
                ]}
            />
            <ModalTranslator
                actionRef={modalTranslatorActionRef}
                ocrResult={ocrResult}
                onReplace={onReplace}
            />
        </>
    );
};

export default OcrTool;
