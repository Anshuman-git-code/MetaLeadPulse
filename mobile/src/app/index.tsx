// ─────────────────────────────────────────────────────────────────────────────
// index.tsx — Leads Screen
//
// This is the main screen of the app. It does four things:
//   1. Connects to the backend via Socket.IO (through the socket service)
//   2. Listens for "new-lead" events from the backend
//   3. Adds each arriving lead into local state
//   4. Renders the current list of leads using FlatList
//
// This file replaces the default Expo welcome screen. The route "/" in
// Expo Router always maps to src/app/index.tsx.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS
// ─────────────────────────────────────────────────────────────────────────────
// React itself. We need it for JSX and for the hooks (useState, useEffect).
import React, { useEffect, useState } from 'react';

// React Native UI primitives.
// FlatList — efficient scrollable list, ideal for a growing list of leads.
// StyleSheet — lets us write styles in JavaScript objects.
// Text, View — the basic building blocks. Every UI element is one of these.
import { FlatList, StyleSheet, Text, View } from 'react-native';

// SafeAreaView makes sure our content doesn't overlap the phone's status bar
// or home indicator at the bottom. The version from react-native-safe-area-context
// works more reliably cross-platform than React Native's built-in one.
import { SafeAreaView } from 'react-native-safe-area-context';

// Our socket connection from the service file.
// Importing this causes the socket to connect immediately (autoConnect: true).
import { socket } from '@/services/socket';

// ThemedView and ThemedText are wrappers around View and Text that
// automatically use the correct colour for light/dark mode.
// They come from the existing project components — we reuse them so the
// leads screen looks consistent with the rest of the app.
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

// Theme constants. Spacing gives us consistent padding/margin numbers.
// BottomTabInset adds extra bottom padding so content isn't hidden behind
// the tab bar. MaxContentWidth keeps the layout from stretching too wide
// on tablets or the web.
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

// ─────────────────────────────────────────────────────────────────────────────
// LEAD TYPE
// ─────────────────────────────────────────────────────────────────────────────
// TypeScript type that describes the shape of a lead object.
// The backend will send us an object with these exact fields when it emits
// a "new-lead" event. Defining the type here means TypeScript can warn us
// if we try to access a field that doesn't exist.
type Lead = {
  id: string;       // unique identifier (leadgen_id from Meta, or a test id)
  name: string;     // full name from the lead form
  email: string;    // email from the lead form
  phone: string;    // phone number from the lead form
  createdAt: string; // ISO timestamp string, e.g. "2026-10-06T12:00:00.000Z"
};

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
// A React component is a function that returns JSX (the HTML-like syntax).
// "export default" means Expo Router picks this up as the screen for the
// "/" route automatically.
export default function LeadsScreen() {

  // ─────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────
  // useState is a React hook. It creates a piece of state — data that
  // lives inside this component and causes the UI to re-render whenever
  // it changes.
  //
  // useState<Lead[]>([]) means:
  //   - the state holds an array of Lead objects (Lead[])
  //   - it starts as an empty array ([])
  //
  // useState returns two things in an array:
  //   leads    — the current value of the state
  //   setLeads — a function we call to update the state
  //
  // Rule: NEVER modify "leads" directly (like leads.push(...)). Always
  // use setLeads(). React only re-renders when it sees setLeads was called.
  const [leads, setLeads] = useState<Lead[]>([]);

  // ─────────────────────────────────────────────────────────────────────────
  // CONNECTION STATUS (for debugging during development)
  // ─────────────────────────────────────────────────────────────────────────
  // We show a small status indicator so we can see at a glance whether
  // the app is connected to the backend. Very useful while debugging.
  // In a production app we might remove this or make it invisible.
  const [connected, setConnected] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  // SOCKET EFFECTS
  // ─────────────────────────────────────────────────────────────────────────
  // useEffect is a React hook that runs side effects — code that reaches
  // outside the component (network, timers, subscriptions).
  //
  // useEffect(() => { ... }, []) means:
  //   - run this function once when the component first mounts (appears)
  //   - the empty [] is the "dependency array" — no dependencies means
  //     "run only once, not after every render"
  //
  // Inside the effect we register event listeners on the socket.
  // The function we return at the end is the "cleanup" — it runs when
  // the component unmounts (disappears). We remove the listeners there
  // to avoid memory leaks and duplicate handlers.
  useEffect(() => {

    // ── connection event ──────────────────────────────────────────────────
    // Fires when the socket successfully connects to the backend.
    // We update the "connected" state to true, which updates the indicator.
    function onConnect() {
      console.log('Connected to backend. Socket ID:', socket.id);
      setConnected(true);
    }

    // ── disconnect event ──────────────────────────────────────────────────
    // Fires when the socket loses its connection.
    // We update the indicator so we can see it happened.
    function onDisconnect() {
      console.log('Disconnected from backend.');
      setConnected(false);
    }

    // ── new-lead event ────────────────────────────────────────────────────
    // This is the main event. The backend emits "new-lead" with a Lead
    // object whenever a new lead arrives (from the test route or from Meta).
    //
    // When this fires:
    //   incomingLead — the Lead object the backend sent us
    //
    // setLeads(prev => [incomingLead, ...prev]) means:
    //   - prev is the current leads array
    //   - we create a NEW array with incomingLead at the front, followed
    //     by all existing leads
    //   - we pass that new array to setLeads
    //   - React sees the state changed and re-renders the FlatList
    //
    // The spread syntax "...prev" means "copy all items from prev here".
    // Result: newest lead always appears at the top of the list.
    function onNewLead(incomingLead: Lead) {
      console.log('New lead received:', incomingLead);
      setLeads(prev => [incomingLead, ...prev]);
    }

    // ── register the listeners ────────────────────────────────────────────
    // socket.on(eventName, handler) tells the socket: "when you receive
    // this event, call this function."
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('new-lead', onNewLead);

    // ── handle the case where socket already connected ────────────────────
    // If the socket connected before this effect ran (which can happen),
    // the 'connect' event already fired and we missed it.
    // We check socket.connected directly and sync the state.
    if (socket.connected) {
      setConnected(true);
    }

    // ── cleanup ───────────────────────────────────────────────────────────
    // Return a function that removes the listeners we added.
    // This runs when the component unmounts.
    // Without this, every time the component mounts it would add
    // another copy of each listener — leading to duplicate updates.
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('new-lead', onNewLead);
    };

  }, []); // empty array = run once on mount

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  // JSX — the HTML-like syntax that describes what the screen looks like.
  // React converts this into native iOS/Android UI elements.
  return (
    // ThemedView fills the whole screen with the correct background colour.
    <ThemedView style={styles.container}>

      {/* SafeAreaView keeps content away from the notch and home indicator */}
      <SafeAreaView style={styles.safeArea}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <ThemedView style={styles.header}>
          <ThemedText type="title">Leads</ThemedText>

          {/* Connection status dot — green when connected, red when not */}
          <View style={[
            styles.statusDot,
            { backgroundColor: connected ? '#34C759' : '#FF3B30' }
          ]} />
        </ThemedView>

        {/* ── Lead count ──────────────────────────────────────────────── */}
        <ThemedText type="small" style={styles.countText}>
          {leads.length === 0
            ? 'No leads yet. Submit a test lead to see it appear here.'
            : `${leads.length} lead${leads.length === 1 ? '' : 's'}`
          }
        </ThemedText>

        {/* ── Leads list ──────────────────────────────────────────────── */}
        {/*
          FlatList is React Native's efficient list component.
          It only renders items that are visible on screen, which keeps
          performance good even with many leads.

          data       — the array to render (our leads state)
          keyExtractor — a function that returns a unique string for each
                         item. React uses this to track which items changed.
          renderItem — a function that receives each item and returns JSX
                       describing how to render it.
          ListEmptyComponent — shown when data is empty. We use null here
                       because we already show the "no leads" message above.
          contentContainerStyle — styles applied to the inner container,
                       not the scroll wrapper itself.
        */}
        <FlatList
          data={leads}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            // Each lead is a card: a ThemedView with lead details inside.
            <ThemedView type="backgroundElement" style={styles.leadCard}>

              {/* Name — most prominent */}
              <Text style={styles.leadName}>{item.name}</Text>

              {/* Email */}
              <Text style={styles.leadDetail}>{item.email}</Text>

              {/* Phone — only shown if the backend sent a non-empty value */}
              {item.phone ? (
                <Text style={styles.leadDetail}>{item.phone}</Text>
              ) : null}

              {/* Timestamp — small, at the bottom of the card */}
              <Text style={styles.leadTime}>
                {new Date(item.createdAt).toLocaleTimeString()}
              </Text>

            </ThemedView>
          )}
        />

      </SafeAreaView>
    </ThemedView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
// StyleSheet.create() takes a plain object of style definitions and returns
// the same object, but optimised for React Native's rendering engine.
// Numbers here are density-independent pixels (dp), not screen pixels.
const styles = StyleSheet.create({
  container: {
    // flex: 1 makes this View take up all available space.
    // Without it the View would have zero height and nothing would show.
    flex: 1,
    flexDirection: 'row',    // needed so MaxContentWidth centering works
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,    // from theme — stops it looking weird on tablets
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  header: {
    flexDirection: 'row',         // title and dot side by side
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,              // circle: half of width/height
  },
  countText: {
    marginBottom: Spacing.two,
    opacity: 0.6,                 // subtle — secondary information
  },
  listContent: {
    gap: Spacing.two,             // space between cards
    paddingBottom: Spacing.three,
  },
  leadCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.one,             // small gap between text lines inside card
  },
  leadName: {
    fontSize: 16,
    fontWeight: '600',            // semi-bold — most important info
    color: '#000',
  },
  leadDetail: {
    fontSize: 14,
    color: '#555',
  },
  leadTime: {
    fontSize: 12,
    color: '#999',
    marginTop: Spacing.one,
  },
});
