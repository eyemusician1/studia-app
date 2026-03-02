// src/hooks/useStudyReminders.ts
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// 1. Fix: Added missing properties (Banner & List) to satisfy TypeScript
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true, 
    shouldShowList: true,
  }),
});

export function useStudyReminders() {
  useEffect(() => {
    async function scheduleReminders() {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;

      await Notifications.cancelAllScheduledNotificationsAsync();

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }

      // 2. Fix: Added explicit 'type' to the triggers to fix the Red Lines

      // Reminder A: "It's been a while" (Time Interval)
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "We miss you!",
          body: "It's been a few days. Come back and review your flashcards!",
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 60 * 60 * 24 * 3, //60 * 60 * 24 * 3 = 3 days
          repeats: false,
        },
      });

      // Reminder B: "Daily Study" (Calendar)
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Time to study!",
          body: "Just 10 minutes of review can boost your memory retention. Let's go!",
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
          hour: 18,  // 6:00 PM
          minute: 0,
          repeats: true,
        },
      });
    }

    scheduleReminders();
  }, []);
}