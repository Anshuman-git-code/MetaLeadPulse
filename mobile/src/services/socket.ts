import { io } from 'socket.io-client';

const BACKEND_URL = 'http://192.168.1.2:3001';

// NOTE: Using the Mac's LAN IP instead of localhost.
// iOS simulator on this setup does not resolve localhost to the host Mac.
// 192.168.1.2 is the Mac's current local network IP (found with: ipconfig getifaddr en0).
// If you move to a different network, this IP may change — update it here.
// Android emulator would use 10.0.2.2 instead.
// A physical phone would also use this LAN IP.

export const socket = io(BACKEND_URL, {
  transports: ['websocket'],
});
