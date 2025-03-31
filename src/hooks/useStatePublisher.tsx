import { Context, createContext, RefObject, useCallback, useEffect, useMemo, useRef } from 'react';

export type StatePublisherListener<Value> = (value: Value, previousValue: Value) => void;

export type StatePublisherContext<Value> = {
    stateRef: RefObject<Value>;
    stateListenersRef: RefObject<Map<number, StatePublisherListener<Value>>>;
    publish: (value: Value) => void;
    subscribe: (callback: StatePublisherListener<Value>) => () => void;
    reset: () => void;
};

export type StatePublisher<Value> = {
    defaultValue: Value;
    context: Context<StatePublisherContext<Value>>;
};

export function createPublisher<Value>(defaultValue: Value): StatePublisher<Value> {
    const context = createContext<StatePublisherContext<Value>>({
        stateRef: { current: defaultValue },
        stateListenersRef: { current: new Map() },
        publish: () => {},
        subscribe: () => () => {},
        reset: () => {},
    });

    return { defaultValue, context };
}

export function PublisherProvider<Value>({
    children,
    statePublisher,
}: {
    children: React.ReactNode;
    statePublisher: StatePublisher<Value>;
}) {
    const { defaultValue, context: StatePublisherContext } = statePublisher;
    const stateRef = useRef(defaultValue);
    const stateListenersRef = useRef<Map<number, StatePublisherListener<Value>>>(new Map());
    const listenerIdRef = useRef<number>(0);

    const publish = useCallback((value: Value) => {
        const previousValue = stateRef.current;
        stateRef.current = value;
        stateListenersRef.current.forEach((listener) => listener(value, previousValue));
    }, []);

    const subscribe = useCallback((listener: StatePublisherListener<Value>) => {
        const listenerId = listenerIdRef.current++;
        stateListenersRef.current.set(listenerId, listener);

        return () => {
            stateListenersRef.current.delete(listenerId);
        };
    }, []);

    const reset = useCallback(() => {
        publish(defaultValue);
    }, [defaultValue, publish]);

    const publisherValue = useMemo(
        () => ({
            stateRef,
            stateListenersRef,
            publish,
            subscribe,
            reset,
        }),
        [stateRef, stateListenersRef, publish, subscribe, reset],
    );

    useEffect(() => {
        setTimeout(() => {
            publish(defaultValue);
        }, 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <StatePublisherContext.Provider value={publisherValue}>
            {children}
        </StatePublisherContext.Provider>
    );
}

function createNestedProviders<Value>(
    statePublishers: StatePublisher<Value>[],
    children: React.ReactNode,
    index: number,
): React.ReactNode {
    if (index >= statePublishers.length) {
        return children;
    }

    return (
        <PublisherProvider statePublisher={statePublishers[index]}>
            {createNestedProviders(statePublishers, children, index + 1)}
        </PublisherProvider>
    );
}

export function withStatePublisher<Props extends object>(
    Component: React.ComponentType<Props>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...statePublishers: StatePublisher<any>[]
) {
    return function WithStatePublisher(props: Props) {
        return createNestedProviders(statePublishers, <Component {...props} />, 0);
    };
}
