import yauzl from 'yauzl';

const SLIDE_ENTRY_RE = /^ppt\/slides\/slide\\d+\\.xml$/i;

export async function getPptxSlideCount(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) {
        reject(err || new Error('unable_to_open_pptx'));
        return;
      }

      let count = 0;

      const finish = (error?: unknown) => {
        try {
          zipfile.close();
        } catch {}
        if (error) reject(error);
        else resolve(count);
      };

      zipfile.on('error', finish);
      zipfile.on('end', () => finish());
      zipfile.on('entry', (entry) => {
        if (SLIDE_ENTRY_RE.test(entry.fileName)) {
          count += 1;
        }
        zipfile.readEntry();
      });

      zipfile.readEntry();
    });
  });
}

