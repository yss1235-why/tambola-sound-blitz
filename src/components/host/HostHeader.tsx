// src/components/host/HostHeader.tsx - Extracted from GameHost
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Crown, Phone, Settings, Trash2 } from 'lucide-react';

interface HostHeaderProps {
    gameName: string;
    hostPhone?: string;
    businessName: string;
    onSettings?: () => void;
    onDelete?: () => void;
    isDeleting?: boolean;
}

export const HostHeader: React.FC<HostHeaderProps> = ({
    gameName,
    hostPhone,
    businessName,
    onSettings,
    onDelete,
    isDeleting
}) => {
    return (
        <Card className="bg-gradient-to-r from-gray-800/90 to-gray-900/90 border-gray-700/50 backdrop-blur-sm">
            <CardContent className="p-4">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-gradient-to-br from-amber-500 to-orange-500">
                            <Crown className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">{businessName}</h1>
                            <p className="text-gray-400">{gameName}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {hostPhone && (
                            <Badge variant="outline" className="border-gray-600 text-gray-300">
                                <Phone className="w-3 h-3 mr-1" />
                                {hostPhone}
                            </Badge>
                        )}

                        {onSettings && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onSettings}
                                className="border-gray-600 text-gray-300 hover:bg-gray-700"
                            >
                                <Settings className="w-4 h-4 mr-1" />
                                Settings
                            </Button>
                        )}

                        {onDelete && (
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={onDelete}
                                disabled={isDeleting}
                                className="bg-red-600/80 hover:bg-red-600"
                            >
                                <Trash2 className="w-4 h-4 mr-1" />
                                {isDeleting ? 'Deleting...' : 'Delete'}
                            </Button>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
