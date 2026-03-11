import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { IngestionSource } from '../packages/shared/src/rag.ts';

function loadEnvFromDotEnv(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }

  const raw = readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function assertRequiredEnvVars(keys: string[]): void {
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

const sources: IngestionSource[] = [
  {
    sourceType: 'policy',
    sourceUrl: 'policy://return-policy',
    title: 'Kebijakan Pengembalian Barang',
    content: `Kami ingin memastikan setiap pelanggan mendapatkan pengalaman belanja yang aman dan nyaman. Jika barang yang diterima tidak sesuai, rusak, atau memiliki cacat produksi, Anda dapat mengajukan pengembalian barang dengan mengikuti ketentuan berikut.

Syarat pengembalian: produk harus dibeli melalui kanal resmi kami, masih dalam kondisi layak jual, belum digunakan secara berlebihan, dan dilengkapi bukti pembelian. Pengajuan hanya dapat diproses apabila dilakukan maksimal 7 hari kalender sejak barang diterima oleh pelanggan. Lewat dari periode tersebut, sistem akan menolak pengajuan secara otomatis kecuali ada persetujuan khusus dari tim layanan pelanggan.

Kondisi barang yang dapat dikembalikan meliputi: barang salah kirim, barang cacat pabrik, atau barang rusak saat pengiriman dengan bukti foto/video saat unboxing. Barang harus dikemas ulang secara aman menggunakan kemasan pelindung agar tidak mengalami kerusakan tambahan selama proses retur. Aksesori bawaan, bonus, kartu garansi, dan label produk wajib disertakan. Jika ada komponen yang hilang, nilai refund dapat disesuaikan.

Proses refund dimulai setelah tim kami menerima barang dan melakukan inspeksi. Pemeriksaan biasanya memakan waktu 1-3 hari kerja. Jika pengajuan disetujui, refund akan diproses ke metode pembayaran awal pelanggan. Waktu penerimaan dana bergantung pada penyedia pembayaran, umumnya 3-10 hari kerja. Untuk pembayaran transfer bank, pelanggan dapat diminta mengirimkan informasi rekening atas nama yang sama dengan data pembelian.

Kategori barang yang tidak dapat dikembalikan mencakup: produk personal care yang segelnya sudah dibuka, makanan/minuman, barang custom atau pre-order khusus, voucher digital, serta produk clearance/sale akhir yang ditandai "tidak dapat diretur". Pengembalian karena perubahan preferensi pribadi (misalnya berubah pikiran) hanya dapat dipertimbangkan jika produk masih tersegel dan ada persetujuan dari tim operasional.

Untuk mengajukan retur, hubungi customer service melalui kanal resmi dengan menyertakan nomor pesanan, alasan pengembalian, dan dokumentasi pendukung. Tim kami akan membantu proses hingga selesai dan memberikan nomor tiket agar status penanganan dapat dilacak kapan saja.`,
    metadata: {
      locale: 'id-ID',
      topic: 'return-policy',
    },
  },
  {
    sourceType: 'shipping_rule',
    sourceUrl: 'policy://shipping-info',
    title: 'Informasi Pengiriman',
    content: `Kami menyediakan beberapa metode pengiriman agar pelanggan dapat memilih layanan sesuai kebutuhan. Metode reguler cocok untuk pengiriman hemat, metode express untuk kebutuhan lebih cepat, dan same-day tersedia terbatas di area tertentu. Pilihan layanan yang muncul di halaman checkout akan menyesuaikan alamat tujuan serta ketersediaan kurir.

Estimasi waktu pengiriman dihitung sejak pesanan terverifikasi dan diproses gudang. Untuk area Jabodetabek, pengiriman reguler umumnya 1-3 hari kerja, express 1-2 hari kerja, dan same-day pada hari yang sama jika pembayaran terkonfirmasi sebelum batas waktu operasional. Untuk luar Jabodetabek, estimasi reguler berkisar 2-6 hari kerja tergantung kota tujuan dan kondisi operasional kurir.

Biaya ongkir ditentukan oleh berat/volume paket, lokasi tujuan, dan jenis layanan yang dipilih. Sistem akan menampilkan biaya akhir sebelum pembayaran dilakukan. Pada periode promo tertentu, pelanggan bisa mendapatkan subsidi ongkir atau gratis ongkir dengan minimum belanja sesuai syarat kampanye.

Area layanan kami mencakup mayoritas wilayah Indonesia yang didukung mitra logistik. Namun, beberapa wilayah terpencil atau kepulauan tertentu dapat mengalami keterbatasan layanan, tambahan biaya, atau waktu kirim lebih lama. Jika alamat tidak terjangkau, tim kami akan menghubungi pelanggan untuk opsi alternatif seperti perubahan alamat atau pembatalan pesanan.

Setelah pesanan dikirim, nomor resi akan tersedia agar pelanggan dapat melakukan pelacakan secara berkala melalui situs kurir atau bantuan customer service kami.`,
    metadata: {
      locale: 'id-ID',
      topic: 'shipping-info',
    },
  },
  {
    sourceType: 'faq',
    sourceUrl: 'faq://general',
    title: 'Pertanyaan yang Sering Diajukan',
    content: `1) Jam operasional customer service
Customer service kami beroperasi setiap Senin-Minggu pukul 08.00-21.00 WIB. Di luar jam operasional, pesan tetap bisa masuk dan akan diproses pada jam kerja berikutnya.

2) Metode pembayaran yang tersedia
Kami menerima transfer bank, virtual account, e-wallet, kartu kredit/debit tertentu, serta pembayaran instan sesuai mitra yang tersedia di checkout.

3) Cara menghubungi customer service
Anda dapat menghubungi kami melalui WhatsApp resmi, email dukungan, atau formulir bantuan di dashboard akun. Sertakan nomor pesanan agar penanganan lebih cepat.

4) Cara melacak pesanan
Setelah pesanan dikirim, Anda akan menerima nomor resi. Resi dapat dilacak dari halaman pesanan atau situs kurir terkait.

5) Apakah produk memiliki garansi?
Sebagian produk memiliki garansi resmi sesuai merek dan kategori. Periode garansi serta cakupan layanan tertera pada detail produk dan kartu garansi.

6) Bagaimana jika paket belum diterima?
Periksa status resi terlebih dahulu. Jika status tidak bergerak lebih dari estimasi normal, hubungi customer service agar kami bantu investigasi ke pihak kurir.

7) Bisakah mengubah alamat setelah checkout?
Perubahan alamat hanya bisa dilakukan sebelum pesanan diproses gudang. Setelah status dipacking atau dikirim, perubahan alamat mengikuti kebijakan kurir.

8) Bagaimana mengajukan komplain produk rusak?
Segera kirim foto/video unboxing, nomor pesanan, dan deskripsi masalah maksimal 7 hari sejak barang diterima agar dapat diproses sesuai kebijakan retur.`,
    metadata: {
      locale: 'id-ID',
      topic: 'general-faq',
    },
  },
];

async function seedKnowledge(): Promise<void> {
  loadEnvFromDotEnv(path.resolve(process.cwd(), '.env'));
  assertRequiredEnvVars(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY']);

  const {
    loadDocument,
    createDocuments,
    singleDocumentUpsert,
    clearDocumentChunks,
    addChunksToVectorStore,
  } = await import('../packages/llm/src/rag/ingestion.ts');
  const { getEmbeddings } = await import('../packages/llm/src/rag/embeddings.ts');
  const { getVectorStore } = await import('../packages/llm/src/rag/vectorstore.ts');

  const embeddings = getEmbeddings();
  const vectorStore = getVectorStore(embeddings);

  let documentsUpserted = 0;
  let chunksInserted = 0;

  for (const source of sources) {
    await loadDocument(source);

    const storedDocument = await singleDocumentUpsert({
      source: source.sourceUrl || `manual-${Date.now()}`,
      title: source.title || null,
      content: source.content,
      version: source.version || '1.0.0',
      metadata: {
        sourceType: source.sourceType,
        ...(source.metadata || {}),
      },
    });

    await clearDocumentChunks(storedDocument.id);

    const chunkedDocuments = await createDocuments(source);
    await addChunksToVectorStore(vectorStore, chunkedDocuments, storedDocument.id);

    documentsUpserted += 1;
    chunksInserted += chunkedDocuments.length;

    console.log(
      `Seeded ${storedDocument.source} (documentId=${storedDocument.id}, chunks=${chunkedDocuments.length})`,
    );
  }

  console.log(
    `Knowledge seed completed: ${documentsUpserted} documents upserted, ${chunksInserted} chunks inserted.`,
  );
}

seedKnowledge().catch((error) => {
  console.error('Knowledge seed failed:', error);
  process.exit(1);
});
