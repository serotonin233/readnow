export interface ProcessedPDF {
  fileName: string;
  text: string;
  pageCount: number;
}

export enum AppStatus {
  IDLE = 'IDLE',
  PARSING_PDF = 'PARSING_PDF',
  GENERATING_AUDIO = 'GENERATING_AUDIO',
  READY_TO_PLAY = 'READY_TO_PLAY',
  PLAYING = 'PLAYING',
  ERROR = 'ERROR'
}

export interface AudioState {
  buffer: AudioBuffer | null;
  duration: number;
}