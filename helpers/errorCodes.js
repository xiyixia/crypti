var util = require('util');

var errorCodes = {
	VOTES: {
		INCORRECT_RECIPIENT: {
			message: "Incorrect recipient %s, in vote transaction recipient is same that sender",
			args: ['recipientId']
		},
		MAXIMUM_DELEGATES_VOTE: {
			message: "You can only vote for a maximum of 33 delegates at any one time: %s",
			args: ["id"]
		},
		ALREADY_VOTED_UNCONFIRMED: {
			message: "Can't verify votes, you already voted for this delegate: %s",
			args: ["id"]
		},
		ALREADY_VOTED_CONFIRMED: {
			message: "Can't verify votes, you already voted for this delegate: %s",
			args: ["id"]
		}
	},
	USERNAMES: {
		INCORRECT_RECIPIENT: {
			message: "Incorrect recipient",
			args: []
		},
		INVALID_AMOUNT: {
			message: "Invalid amount of transaction: %s",
			args: ["id"]
		},
		EMPTY_ASSET: {
			message: "Empty transaction asset for username transaction: %s",
			args: ["id"]
		},
		ALLOW_CHARS: {
			message: "Username can only contain alphanumeric characters with the exception of !@$&_.: %s",
			args: ["id"]
		},
		USERNAME_LIKE_ADDRESS: {
			message: "Username can't be like an address: %s",
			args: ["id"]
		},
		INCORRECT_USERNAME_LENGTH: {
			message: "Incorrect username length: %s",
			args: ["asset.username"]
		},
		EXISTS_USERNAME: {
			message: "The username you entered is already in use. Please try a different name.: %s",
			args: ["id"]
		}
	},
	ACCOUNTS: {
		ACCOUNT_PUBLIC_KEY_NOT_FOUND: {
			message: "Account public key can't be found: %s",
			args: ["address"]
		},
		ACCOUNT_DOESNT_FOUND: {
			message: "Account doesn't found: %s",
			args: ["address"]
		}
	},
	DELEGATES: {
		INVALID_RECIPIENT: {
			message: "Invalid recipientId: %s",
			args: ["id"]
		},
		INVALID_AMOUNT: {
			message: "Invalid amount: %i",
			args: ["amount"]
		},
		EMPTY_TRANSACTION_ASSET: {
			message: "Empty transaction asset for delegate transaction: %s",
			args: ["id"]
		},
		USERNAME_CHARS: {
			message: "Username can only contain alphanumeric characters with the exception of !@$&_.: %s",
			args: ["asset.delegate.username"]
		},
		USERNAME_LIKE_ADDRESS: {
			message: "Username can't be like an address: %s",
			args: ["asset.delegate.username"]
		},
		USERNAME_IS_TOO_SHORT: {
			message: "Delegate name is too short: %s",
			args: ["asset.delegate.username"]
		},
		USERNAME_IS_TOO_LONG: {
			message: "Delegate name is longer then 20 chars: ",
			args: ["asset.delegate.username"]
		},
		EXISTS_USERNAME: {
			message: "The delegate name you entered is already in use. Please try a different name.: %s",
			args: ["asset.delegate.username"]
		},
		EXISTS_DELEGATE: {
			message: "Your account are delegate already",
			args: []
		},
		DELEGATE_NOT_FOUND: {
			message: "Delegate not found",
			args: []
		},
		FORGER_PUBLIC_KEY: {
			message: "Provide generatorPublicKey in request",
			args: []
		},
		FORGING_ALREADY_ENABLED: {
			message: "Forging on this account already enabled",
			args: []
		},
		DELEGATE_NOT_FOUND: {
			message: "Delegate for this secret not found",
			args: []
		},
		FORGER_NOT_FOUND: {
			message: "Forger with this public key not found",
			args: []
		}
	},
	COMMON: {
		INVALID_SECRET_KEY: {
			message: "Please, provide valid secret key of your account",
			args: []
		},
		OPEN_ACCOUNT: {
			message: "Open your account to make transaction",
			args: []
		},
		SECOND_SECRET_KEY: {
			message: "Provide second secret key",
			args: []
		},
		ACCESS_DENIED: {
			message: "Access denied",
			args: []
		}
	},
	BLOCKS: {
		BLOCK_NOT_FOUND: {
			message: "Block not found",
			args: []
		}
	},
	TRANSACTIONS: {
		INVALID_RECIPIENT: {
			message: "Invalid recipientId: %s",
			args: ["recipientId"]
		},
		INVALID_AMOUNT: {
			message: "Invalid transaction amount: %i",
			args: ["amount"]
		},
		TRANSACTION_NOT_FOUND: {
			message: "Transaction not found",
			args: []
		},
		TRANSACTIONS_NOT_FOUND: {
			message: "Transactions not found",
			args: []
		},
		RECIPIENT_NOT_FOUND: {
			message: "Recipient is not found",
			args: []
		}
	},
	SIGNATURES: {
		INVALID_ASSET: {
			message: "Empty transaction asset for signature transaction: %s",
			args: ["id"]
		},
		INVALID_AMOUNT: {
			message: "Invalid amount: %i",
			args: ["amount"]
		},
		INVALID_LENGTH: {
			message: "Invalid length for signature public key: %s",
			args: ["id"]
		},
		INVALID_HEX: {
			message: "Invalid hex in signature public key: %s",
			args: ["id"]
		}
	}
}

function error(code, object) {
	var codes = code.split('.');
	var errorObj = errorCodes[codes[0]][codes[1]];

	var args = [errorObj.message];
	errorObj.args.forEach(function (el) {
		var value = null;

		if (el.indexOf('.') > 0) {
			var els = el.split('.');
			value = object;

			els.forEach(function (subel) {
				value = value[subel];
			});
		} else {
			value = object[el];
		}

		args.push(value);
	});

	var error = util.format.apply(this, args);
	return error;
}

module.exports = {
	errorCodes: errorCodes,
	error: error
};