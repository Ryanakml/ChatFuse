export type KnowledgeDocument = {
    id: string;
    source: string;
    title: string | null;
    content: string;
    version: string;
    metadata: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
};
export type KnowledgeChunk = {
    id: string;
    documentId: string;
    chunkIndex: number;
    content: string;
    embedding: number[];
    metadata: Record<string, unknown>;
    createdAt: string;
};
export type IngestionSource = {
    sourceType: 'faq' | 'policy' | 'product_catalog' | 'shipping_rule' | 'other';
    sourceUrl?: string;
    title?: string;
    content: string;
    version?: string;
    metadata?: Record<string, unknown>;
};
//# sourceMappingURL=rag.d.ts.map