import { createPptxPdfModeRouter } from './pptx-pdf-mode-router';

export default createPptxPdfModeRouter({
  routeBase: 'pptx-summary-pdf',
  queueName: 'pptx-summary-pdf',
  uploadDirName: 'pptx-summary-pdf',
  resultsDirName: 'pptx-summary-pdf-results',
  outputMode: 'narrative_summary',
  defaultIncludeSpeakerNotes: true,
  enableDotsBeta: true,
});
