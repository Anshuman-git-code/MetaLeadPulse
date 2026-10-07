// ─────────────────────────────────────────────────────────────────────────────
// socket.ts — Socket.IO client setup
//
// This file has one job: create a single Socket.IO client connection and
// export it so any screen in the app can use the same connection.
//
// Why a separate file?
// If we created the socket inside the screen component, a new connection
// would be made every time that screen re-renders. We only want one
// connection for the lifetime of the app. Putting it here ensures exactly
// that — one file, one socket object, shared everywhere.
// ─────────────────────────────────────────────────────────────────────────────

import { io } from 'socket.io-client';

// ─────────────────────────────────────────────────────────────────────────────
// BACKEND URL
// ─────────────────────────────────────────────────────────────────────────────
// This is the address of our Node.js backend.
//
// Why not just "localhost:3000"?
//
// "localhost" means "this device". When the React Native app runs inside
// the Expo Go app on your phone or simulator, "this device" is the
// simulator or phone — not your Mac. So it would look for the backend
// on the phone itself, which doesn't exist.
//
// For iOS simulator, "localhost" usually works fine because the simulator
// shares the Mac's network stack.
//
// For Android emulator, use 10.0.2.2 which is a special address that
// redirects to the host machine (your Mac).
//
// For a real physical phone, use your Mac's local IP address
// (find it in System Settings → Network, looks like 192.168.x.x).
//
// START with localhost. If the connection doesn't work, change this URL.
// ─────────────────────────────────────────────────────────────────────────────
const BACKEND_URL = 'http://192.168.1.2:3001';

// NOTE: Using the Mac's LAN IP instead of localhost.
// iOS simulator on this setup does not resolve localhost to the host Mac.
// 192.168.1.2 is the Mac's current local network IP (found with: ipconfig getifaddr en0).
// If you move to a different network, this IP may change — update it here.
// Android emulator would use 10.0.2.2 instead.
// A physical phone would also use this LAN IP.

// ─────────────────────────────────────────────────────────────────────────────
// CREATE THE SOCKET
// ─────────────────────────────────────────────────────────────────────────────
// io(BACKEND_URL) creates a Socket.IO client and immediately tries to
// connect to our backend at that URL.
//
// The options object:
//   transports: ['websocket']
//     — tells Socket.IO to use WebSocket directly, skipping the
//       HTTP long-polling fallback. More reliable in React Native.
//
//   autoConnect: true (default)
//     — connection starts as soon as this file is imported.
//       The app doesn't need to manually call connect().
// ─────────────────────────────────────────────────────────────────────────────
export const socket = io(BACKEND_URL, {
  transports: ['websocket'],
});
