import type { FileChange } from '@/entities/repository';

export interface FlashCard {
  question: string;
  answer: string;
  highlights?: string[];
  metadata?: {
    commitMessage?: string;
    rawDiff?: string;
    files?: FileChange[];
    filename?: string;
    repositoryFullName?: string;
    branch?: string;
  };
}

export interface FlashCardData {
  question: string;
  answer: string;
  highlights?: string[];
  metadata?: {
    commitMessage?: string;
    rawDiff?: string;
    files?: FileChange[];
    repositoryFullName?: string;
    branch?: string;
  };
}
