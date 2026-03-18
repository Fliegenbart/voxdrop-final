import { createPptxPdfModeRouter } from './pptx-pdf-mode-router';

export default createPptxPdfModeRouter({
  routeBase: 'pptx-faithful-pdf',
  queueName: 'pptx-faithful-pdf',
  uploadDirName: 'pptx-faithful-pdf',
  resultsDirName: 'pptx-faithful-pdf-results',
  outputMode: 'faithful_accessible',
  defaultIncludeSpeakerNotes: false,
  enableDotsBeta: false,
});
