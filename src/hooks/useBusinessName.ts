// src/hooks/useBusinessName.ts - Subscribe to businessName from systemSettings (publicly readable)
import { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '@/services/firebase-core';

const BUSINESS_NAME_PATH = 'systemSettings/businessName';

/**
 * Hook to subscribe to the business name from Firebase systemSettings.
 * Uses the same publicly-accessible path pattern as the theme system.
 * Works for unauthenticated users since systemSettings/shopName has .read: true.
 */
export const useBusinessName = (): { businessName: string; loading: boolean } => {
    const [businessName, setBusinessName] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const businessNameRef = ref(database, BUSINESS_NAME_PATH);
        let hasReceived = false;

        const unsubscribe = onValue(
            businessNameRef,
            (snapshot) => {
                hasReceived = true;
                if (snapshot.exists()) {
                    setBusinessName(snapshot.val() as string);
                } else {
                    setBusinessName('');
                }
                setLoading(false);
            },
            (error) => {
                hasReceived = true;
                // Permission denied or other error
                console.error('Failed to read businessName from systemSettings:', error);
                setBusinessName('');
                setLoading(false);
            }
        );

        // ✅ FIX: Timeout to prevent infinite loading on slow/no network
        const timeout = setTimeout(() => {
            if (!hasReceived) {
                setBusinessName('');
                setLoading(false);
            }
        }, 10_000); // 10 seconds

        return () => {
            clearTimeout(timeout);
            unsubscribe();
        };
    }, []);

    return { businessName, loading };
};
