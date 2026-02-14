// src/hooks/useShopName.ts - Subscribe to shopName from systemSettings (same pattern as theme)
import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '@/services/firebase-core';

const SHOP_NAME_PATH = 'systemSettings/shopName';

/**
 * Hook to subscribe to the shop name from Firebase systemSettings.
 * Uses the same publicly-accessible path pattern as the theme system.
 * Works for unauthenticated users since systemSettings is readable by all.
 */
export const useShopName = (): { shopName: string; loading: boolean } => {
    const [shopName, setShopName] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const shopNameRef = ref(database, SHOP_NAME_PATH);

        const unsubscribe = onValue(
            shopNameRef,
            (snapshot) => {
                if (snapshot.exists()) {
                    setShopName(snapshot.val() as string);
                } else {
                    setShopName('');
                }
                setLoading(false);
            },
            (error) => {
                // Permission denied or other error — use empty string
                setShopName('');
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, []);

    return { shopName, loading };
};
