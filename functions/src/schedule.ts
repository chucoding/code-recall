import {onSchedule} from "firebase-functions/v2/scheduler";
import {getMessaging} from "firebase-admin/messaging";
import {getFirestore} from "firebase-admin/firestore";
import {getHourInTimezone} from "./timezone.js";

// 매시 정각 실행: pushEnabled && fcmToken 있는 사용자 중, 해당 사용자 타임존의 "현재 시"가 preferredPushHour와 같은 경우에만 FCM 발송
const FCM_BATCH_SIZE = 500;
const DEFAULT_PUSH_TIMEZONE = "Asia/Seoul";

export const sendDaily8amPush = onSchedule(
  {
    schedule: "0 * * * *", // 매시 정각 (24회/일로 전 타임존 커버)
    timeZone: "Asia/Seoul",
    region: "asia-northeast3",
  },
  async (event) => {
    try {
      const db = getFirestore();
      const usersSnapshot = await db.collection("users").where("pushEnabled", "==", true).get();

      const now =
        typeof event?.scheduleTime === "string"
          ? new Date(event.scheduleTime)
          : new Date();
      const utcHour = now.getUTCHours();

      const tokens: string[] = [];
      usersSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const token = data.fcmToken;
        const preferredHour = typeof data.preferredPushHour === "number" ? data.preferredPushHour : 8;
        const tz = typeof data.preferredPushTimezone === "string" && data.preferredPushTimezone
          ? data.preferredPushTimezone
          : DEFAULT_PUSH_TIMEZONE;
        const hourInTz = getHourInTimezone(now, tz);
        if (token && typeof token === "string" && preferredHour === hourInTz) {
          tokens.push(token);
        }
      });

      console.log(
        `Daily push: UTC hour=${utcHour}, sending to ${tokens.length} users (by their local hour)`
      );

      if (tokens.length === 0) {
        console.log("No push-enabled users with FCM token. Skipping send.");
        return;
      }

      const messaging = getMessaging();
      const notification = {
        title: "오늘의 리마인더",
        body: "복습할 카드가 도착했어요!",
      };
      // url: 알림 클릭 시 서비스 워커가 여는 경로 (`/`는 랜딩이므로 앱 진입점 지정)
      const data = { type: "daily-reminder", url: "/app" };

      let successCount = 0;
      let failureCount = 0;

      for (let i = 0; i < tokens.length; i += FCM_BATCH_SIZE) {
        const batch = tokens.slice(i, i + FCM_BATCH_SIZE);
        const messages = batch.map((token) => ({
          token,
          notification,
          data,
        }));
        const response = await messaging.sendEach(messages);
        response.responses.forEach((r) => (r.success ? successCount++ : failureCount++));
        if (response.failureCount > 0) {
          response.responses.forEach((r, idx) => {
            if (!r.success) {
              console.warn("FCM send failed for token index", i + idx, r.error?.message);
            }
          });
        }
      }

      console.log(`Successfully sent: ${successCount}, failed: ${failureCount}`);
    } catch (error) {
      console.error("Error sending push notification:", error);
    }
  }
);

// 매일 정오 12시(KST)에 전날 이전 탈퇴 기록 모두 삭제
// 탈퇴 당일만 재가입 차단, 다음날부터는 재가입 가능하므로
// 오늘 탈퇴한 기록만 유지하고 나머지는 삭제
export const cleanupDeletedUsers = onSchedule(
  {
    schedule: "0 3 * * *", // KST 12:00 = UTC 03:00
    timeZone: "Asia/Seoul",
    region: "asia-northeast3",
  },
  async () => {
    try {
      console.log("🗑️ deletedUsers 정리 작업 시작 (매일 12시)");

      const db = getFirestore();
      const deletedUsersRef = db.collection("deletedUsers");

      // 오늘 날짜 (KST 기준)
      const now = new Date();
      const kstOffset = 9 * 60; // KST = UTC+9
      const kstNow = new Date(now.getTime() + kstOffset * 60 * 1000);
      const todayKST = kstNow.toISOString().split("T")[0]; // "2025-10-20"

      console.log(`📅 오늘 날짜 (KST): ${todayKST}`);
      console.log("📅 오늘 탈퇴 기록만 유지, 어제 이전 기록은 모두 삭제");

      // 모든 탈퇴 기록 조회
      const snapshot = await deletedUsersRef.get();

      if (snapshot.empty) {
        console.log("✅ 삭제할 문서 없음");
        return;
      }

      // 배치 삭제
      const batch = db.batch();
      let deletedCount = 0;
      let keptCount = 0;

      snapshot.forEach((doc) => {
        const data = doc.data();
        const deletedAt = new Date(data.deletedAt);
        const kstDeletedAt = new Date(deletedAt.getTime() + kstOffset * 60 * 1000);
        const deletedDateKST = kstDeletedAt.toISOString().split("T")[0];

        if (deletedDateKST === todayKST) {
          // 오늘 탈퇴한 기록은 유지
          console.log(`  - 유지: ${doc.id} (${data.email}, 탈퇴: ${data.deletedAt})`);
          keptCount++;
        } else {
          // 어제 이전 탈퇴 기록은 삭제
          console.log(`  - 삭제: ${doc.id} (${data.email}, 탈퇴: ${data.deletedAt})`);
          batch.delete(doc.ref);
          deletedCount++;
        }
      });

      if (deletedCount > 0) {
        await batch.commit();
        console.log(`✅ ${deletedCount}개 삭제, ${keptCount}개 유지 완료`);
      } else {
        console.log(`✅ 삭제할 문서 없음, ${keptCount}개 유지`);
      }
    } catch (error) {
      console.error("❌ deletedUsers 정리 실패:", error);
    }
  }
);
