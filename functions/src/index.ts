import {setGlobalOptions} from "firebase-functions";
import {initializeApp} from "firebase-admin/app";

// For cost control, set the maximum number of containers that can be
// running at the same time.
setGlobalOptions({maxInstances: 10});

initializeApp();

export * from "./github.js";
export * from "./schedule.js";
export * from "./flashcard-pregeneration.js";
export * from "./openai.js";
export * from "./regenerateQuestion.js";
export * from "./translateFlashcards.js";
export * from "./trending.js";
// TODO: Stripe 연동 시 아래 주석 해제
// export * from "./stripe.js";
