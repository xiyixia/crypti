var crypto = require('crypto'),
	ed = require('ed25519'),
	bignum = require('bignum'),
	ByteBuffer = require("bytebuffer"),
	constants = require("./constants.js"),
	signatureHelper = require("./signature.js"),
	scriptHelper = require("./script.js");

// get valid transaction fee, if we need to get fee for block generator, use isGenerator = true
function getTransactionFee(transaction, isGenerator) {
	var fee = -1;

	switch (transaction.type) {
		case 0:
			fee = transaction.fee;
			break;
		case 1:
			fee = 100 * constants.fixedPoint;
			break;
		case 2:
			// delegate registration
			fee = 50 * constants.fixedPoint;
			break;
		case 3:
			fee = transaction.fee;
			break;
		case 4:
			fee = 100 * constants.fixedPoint;
			break;
	}

	if (fee == -1) {
		return false;
	}

	return fee;
}

function getLastChar(transaction) {
	return transaction.recipientId[transaction.recipientId.length - 1];
}

function getBytes(transaction) {
	var assetSize = 0,
		assetBytes = null;

	switch (transaction.type) {
		case 1:
			assetSize = 32;
			assetBytes = signatureHelper.getBytes(transaction.asset.signature);
			break;

		case 2:
			assetBytes = new Buffer(transaction.asset.delegate.username, 'utf8');
			assetSize = assetBytes.length;
			break;

		case 3:
			if (transaction.asset.votes !== null) {
				assetSize = transaction.asset.votes.length * 32;
				var bb = new ByteBuffer(assetSize, true);
				for (var i = 0; i < transaction.asset.votes.length; i++) {
					var publicKey = new Buffer(transaction.asset.votes[i], 'hex');

					for (var j = 0; j < publicKey.length; j++) {
						bb.writeByte(publicKey[j]);
					}
				}
				bb.flip();
				assetBytes = bb.toBuffer();
			}
			break;

		case 4:
			assetBytes = scriptHelper.getBytes(transaction.asset.script);
			assetBytes = Buffer.concat([assetBytes, new Buffer(transaction.asset.input, 'hex')]);
			assetSize = assetBytes.length;
			break;
	}

	var bb = new ByteBuffer(1 + 4 + 32 + 8 + 8 + 64 + 64 + assetSize, true);
	bb.writeByte(transaction.type);
	bb.writeInt(transaction.timestamp);

	var senderPublicKeyBuffer = new Buffer(transaction.senderPublicKey, 'hex');
	for (var i = 0; i < senderPublicKeyBuffer.length; i++) {
		bb.writeByte(senderPublicKeyBuffer[i]);
	}

	if (transaction.recipientId) {
		var recipient = transaction.recipientId.slice(0, -1);
		recipient = bignum(recipient).toBuffer({size: 8});

		for (var i = 0; i < 8; i++) {
			bb.writeByte(recipient[i] || 0);
		}
	} else {
		for (var i = 0; i < 8; i++) {
			bb.writeByte(0);
		}
	}

	bb.writeLong(transaction.amount);

	if (assetSize > 0) {
		for (var i = 0; i < assetSize; i++) {
			bb.writeByte(assetBytes[i]);
		}
	}

	if (transaction.signature) {
		var signatureBuffer = new Buffer(transaction.signature, 'hex');
		for (var i = 0; i < signatureBuffer.length; i++) {
			bb.writeByte(signatureBuffer[i]);
		}
	}

	if (transaction.signSignature) {
		var signSignatureBuffer = new Buffer(transaction.signSignature, 'hex');
		for (var i = 0; i < signSignatureBuffer.length; i++) {
			bb.writeByte(signSignatureBuffer[i]);
		}
	}

	bb.flip();
	return bb.toBuffer();
}

function getId(transaction) {
	var hash = crypto.createHash('sha256').update(getBytes(transaction)).digest();
	var temp = new Buffer(8);
	for (var i = 0; i < 8; i++) {
		temp[i] = hash[7 - i];
	}

	var id = bignum.fromBuffer(temp).toString();
	return id;
}

function getHash(transaction) {
	return crypto.createHash('sha256').update(getBytes(transaction)).digest();
}

function getFee(transaction, percent) {
	switch (transaction.type) {
		case 0:
			return parseInt(transaction.amount / 100 * percent);
			break;

		case 1:
			return 100 * constants.fixedPoint;
			break;

		case 2:
			return 50 * constants.fixedPoint;
			break;

		case 3:
			return parseInt(transaction.amount / 100 * percent);
			break;

		case 4:
			return 100 * constants.fixedPoint;
			break;
	}
}

module.exports = {
	getTransactionFee: getTransactionFee,
	getBytes: getBytes,
	getId: getId,
	getLastChar: getLastChar,
	getHash: getHash,
	getFee: getFee
};