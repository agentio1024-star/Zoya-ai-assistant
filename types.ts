/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ConnectionState = 'disconnected' | 'connecting' | 'listening' | 'speaking' | 'error';

export interface ToolCallPayload {
  id: string;
  name: string;
  args: {
    url: string;
    label: string;
    [key: string]: any;
  };
}

export interface WebSiteItem {
  id: string;
  name: string;
  url: string;
  timestamp: number;
}
