import {
	signature as Signature,
	getUtf8Encoder,
	verifySignature,
	type SignatureBytes,
} from "@solana/kit";
import bs58 from "bs58";

export async function validateSignature(
	publicKey: string,
	message: string,
	signature: string,
): Promise<boolean> {
	const publicKeyBytes = bs58.decode(publicKey);
	const signatureBytes = bs58.decode(signature);
	const messageBytes = getUtf8Encoder().encode(message);

	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		publicKeyBytes,
		{ name: "Ed25519" },
		true, // extractable
		["verify"],
	);

	return verifySignature(
		cryptoKey,
		signatureBytes as SignatureBytes,
		messageBytes,
	);
}
