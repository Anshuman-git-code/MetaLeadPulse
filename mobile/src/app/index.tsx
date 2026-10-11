import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { socket } from '@/services/socket';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

type Lead = {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: string;
};

export default function LeadsScreen() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    function onConnect() {
      console.log('Connected to backend. Socket ID:', socket.id);
      setConnected(true);
    }

    function onDisconnect() {
      console.log('Disconnected from backend.');
      setConnected(false);
    }

    function onNewLead(incomingLead: Lead) {
      console.log('New lead received:', incomingLead);
      setLeads(prev => [incomingLead, ...prev]);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('new-lead', onNewLead);

    if (socket.connected) {
      setConnected(true);
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('new-lead', onNewLead);
    };
  }, []);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.header}>
          <ThemedText type="title">Leads</ThemedText>
          <View style={[
            styles.statusDot,
            { backgroundColor: connected ? '#34C759' : '#FF3B30' }
          ]} />
        </ThemedView>

        <ThemedText type="small" style={styles.countText}>
          {leads.length === 0
            ? 'No leads yet. Submit a test lead to see it appear here.'
            : `${leads.length} lead${leads.length === 1 ? '' : 's'}`
          }
        </ThemedText>

        <FlatList
          data={leads}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <ThemedView type="backgroundElement" style={styles.leadCard}>
              <Text style={styles.leadName}>{item.name}</Text>
              <Text style={styles.leadDetail}>{item.email}</Text>
              {item.phone ? (
                <Text style={styles.leadDetail}>{item.phone}</Text>
              ) : null}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  countText: {
    marginBottom: Spacing.two,
    opacity: 0.6,
  },
  listContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  leadCard: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  leadName: {
    fontSize: 16,
    fontWeight: '600',
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
