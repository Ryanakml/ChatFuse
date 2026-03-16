export const sendWhatsAppTextMessage = async (input) => {
    const endpoint = `https://graph.facebook.com/v22.0/${input.phoneNumberId}/messages`;
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${input.accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: input.to,
            type: 'text',
            text: {
                body: input.text,
            },
        }),
    });
    const responseBody = await response.text();
    if (!response.ok) {
        throw new Error(`WhatsApp outbound failed (${response.status}): ${responseBody}`);
    }
    if (responseBody.trim() === '') {
        return { messageId: null };
    }
    try {
        const parsed = JSON.parse(responseBody);
        const messageId = parsed.messages?.[0]?.id;
        return {
            messageId: typeof messageId === 'string' && messageId.trim() !== '' ? messageId : null,
        };
    }
    catch {
        return { messageId: null };
    }
};
