var ed = require('ed25519'),
	util = require('util'),
	ByteBuffer = require("bytebuffer"),
	crypto = require('crypto'),
	genesisblock = require('../helpers/genesisblock.js'),
	constants = require("../helpers/constants.js"),
	slots = require('../helpers/slots.js'),
	extend = require('extend'),
	Router = require('../helpers/router.js'),
	async = require('async'),
	TransactionTypes = require('../helpers/transaction-types.js'),
	errorCode = require('../helpers/errorCodes.js').error;

// private fields
var modules, library, self, private = {};

private.hiddenTransactions = [];
private.unconfirmedTransactions = [];
private.unconfirmedTransactionsIdIndex = {};
private.doubleSpendingTransactions = {};

function Transfer() {
	this.create = function (data, trs) {
		trs.recipientId = data.recipientId;
		trs.recipientUsername = data.recipientUsername;
		trs.amount = data.amount;

		return trs;
	}

	this.calculateFee = function (trs) {
		var fee = parseInt(trs.amount / 100 * library.logic.block.calculateFee());
		return fee || 1;
	}

	this.verify = function (trs, sender, cb) {
		var isAddress = /^[0-9]+[C|c]$/g;
		if (!isAddress.test(trs.recipientId.toLowerCase())) {
			return cb(errorCode("TRANSACTIONS.INVALID_RECIPIENT", trs));
		}

		if (trs.amount <= 0) {
			return cb(errorCode("TRANSACTIONS.INVALID_AMOUNT", trs));
		}

		cb(null, trs);
	}

	this.process = function (trs, sender, cb) {
		setImmediate(cb, null, trs);
	}

	this.getBytes = function (trs) {
		return null;
	}

	this.apply = function (trs, sender, cb) {
		modules.accounts.setAccountAndGet({address: trs.recipientId}, function (err, recipient) {
			if (err) {
				return cb(err);
			}
			modules.accounts.mergeAccountAndGet({
				address: trs.recipientId,
				balance: trs.amount,
				u_balance: trs.amount
			}, cb);
		});
	}

	this.undo = function (trs, sender, cb) {
		modules.accounts.setAccountAndGet({address: trs.recipientId}, function (err, recipient) {
			if (err) {
				return cb(err);
			}
			modules.accounts.mergeAccountAndGet({
				address: trs.recipientId,
				balance: -trs.amount,
				u_balance: -trs.amount
			}, cb);
		});
	}

	this.applyUnconfirmed = function (trs, sender, cb) {
		setImmediate(cb);
	}

	this.undoUnconfirmed = function (trs, sender, cb) {
		setImmediate(cb);
	}

	this.objectNormalize = function (trs) {
		delete trs.blockId;
		return trs;
	}

	this.dbRead = function (raw) {
		return null;
	}

	this.dbSave = function (trs, cb) {
		setImmediate(cb);
	}

	this.ready = function (trs, sender) {
		if (sender.multisignatures.length) {
			if (!trs.signatures) {
				return false;
			}
			return trs.signatures.length >= sender.multimin;
		} else {
			return true;
		}
	}
}

//constructor
function Transactions(cb, scope) {
	library = scope;
	self = this;
	self.__private = private;
	attachApi();

	library.logic.transaction.attachAssetType(TransactionTypes.SEND, new Transfer());

	setImmediate(cb, null, self);
}

//private methods
function attachApi() {
	var router = new Router();

	router.use(function (req, res, next) {
		if (modules) return next();
		res.status(500).send({success: false, error: errorCode('COMMON.LOADING')});
	});

	router.get('/', function (req, res) {
		req.sanitize(req.query, {
			type: "object",
			properties: {
				blockId: {
					type: "string"
				},
				limit: {
					type: "integer",
					minimum: 0,
					maximum: 100
				},
				type: {
					type: "integer",
					minimum: 0,
					maximum: 10
				},
				orderBy: {
					type: "string"
				},
				offset: {
					type: "integer",
					minimum: 0
				},
				senderPublicKey: {
					type: "string",
					format: "publicKey"
				},
				ownerPublicKey: {
					type: "string",
					format: "publicKey"
				},
				ownerAddress: {
					type: "string"
				},
				senderId: {
					type: "string"
				},
				recipientId: {
					type: "string"
				},
				senderUsername: {
					type: "string"
				},
				recipientUsername: {
					type: "string"
				},
				amount: {
					type: "integer",
					minimum: 0,
					maximum: constants.fixedPoint
				},
				fee: {
					type: "integer",
					minimum: 0,
					maximum: constants.fixedPoint
				}
			}
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			private.list(query, function (err, data) {
				if (err) {
					return res.json({success: false, error: errorCode("TRANSACTIONS.TRANSACTIONS_NOT_FOUND")});
				}

				res.json({success: true, transactions: data.transactions, count: data.count});
			});
		});
	});

	router.get('/get', function (req, res) {
		req.sanitize(req.query, {
			type: 'object',
			properties: {
				id: {
					type: 'string',
					minLength: 1
				}
			},
			required: ['id']
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			private.getById(query.id, function (err, transaction) {
				if (!transaction || err) {
					return res.json({success: false, error: errorCode("TRANSACTIONS.TRANSACTION_NOT_FOUND")});
				}
				res.json({success: true, transaction: transaction});
			});
		});
	});

	router.get('/unconfirmed/get', function (req, res) {
		req.sanitize(req.query, {
			type: 'object',
			properties: {
				id: {
					type: 'string',
					minLength: 1
				}
			},
			required: ['id']
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var unconfirmedTransaction = self.getUnconfirmedTransaction(query.id);

			if (!unconfirmedTransaction) {
				return res.json({success: false, error: errorCode("TRANSACTIONS.TRANSACTION_NOT_FOUND")});
			}

			res.json({success: true, transaction: unconfirmedTransaction});
		});
	});

	router.get('/unconfirmed/', function (req, res) {
		req.sanitize(req.query, {
			type: "object",
			properties: {
				senderPublicKey: {
					type: "string",
					format: "publicKey"
				},
				address: {
					type: "string"
				}
			}
		}, function (err, report, query) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var transactions = self.getUnconfirmedTransactionList(true),
				toSend = [];

			if (query.senderPublicKey || query.address) {
				for (var i = 0; i < transactions.length; i++) {
					if (transactions[i].senderPublicKey == query.senderPublicKey || transactions[i].recipientId == query.address) {
						toSend.push(transactions[i]);
					}
				}
			} else {
				for (var i = 0; i < transactions.length; i++) {
					toSend.push(transactions[i]);
				}
			}

			res.json({success: true, transactions: toSend});
		});
	});

	router.put('/', function (req, res) {
		req.sanitize(req.body, {
			type: "object",
			properties: {
				secret: {
					type: "string",
					minLength: 1,
					maxLength: 100
				},
				amount: {
					type: "integer",
					minimum: 1,
					maximum: constants.totalAmount
				},
				recipientId: {
					type: "string",
					minLength: 1
				},
				publicKey: {
					type: "string",
					format: "publicKey"
				},
				secondSecret: {
					type: "string",
					minLength: 1,
					maxLength: 100
				}
			},
			required: ["secret", "amount", "recipientId"]
		}, function (err, report, body) {
			if (err) return next(err);
			if (!report.isValid) return res.json({success: false, error: report.issues});

			var query = {};

			var isAddress = /^[0-9]+[C|c]$/g;
			if (isAddress.test(body.recipientId)) {
				query.address = body.recipientId;
			} else {
				query.username = body.recipientId;
			}

			modules.accounts.getAccount(query, function (err, recipient) {
				if (err) {
					return res.json({success: false, error: err.toString()});
				}
				if (!recipient) {
					return res.json({success: false, error: errorCode("TRANSACTIONS.RECIPIENT_NOT_FOUND")});
				}
				var recipientId = recipient.address
				var recipientUsername = recipient.username;

				var hash = crypto.createHash('sha256').update(body.secret, 'utf8').digest();
				var keypair = ed.MakeKeypair(hash);

				if (body.publicKey) {
					if (keypair.publicKey.toString('hex') != body.publicKey) {
						return res.json({success: false, error: errorCode("COMMON.INVALID_SECRET_KEY")});
					}
				}

				modules.accounts.getAccount({publicKey: keypair.publicKey.toString('hex')}, function (err, account) {
					if (err) {
						return res.json({success: false, error: err.toString()});
					}
					if (!account || !account.publicKey) {
						return res.json({success: false, error: errorCode("COMMON.OPEN_ACCOUNT")});
					}

					if (account.secondSignature && !body.secondSecret) {
						return res.json({success: false, error: errorCode("COMMON.SECOND_SECRET_KEY")});
					}

					var secondKeypair = null;

					if (account.secondSignature) {
						var secondHash = crypto.createHash('sha256').update(body.secondSecret, 'utf8').digest();
						secondKeypair = ed.MakeKeypair(secondHash);
					}

					var transaction = library.logic.transaction.create({
						type: TransactionTypes.SEND,
						amount: body.amount,
						sender: account,
						recipientId: recipientId,
						recipientUsername: recipientUsername,
						keypair: keypair,
						secondKeypair: secondKeypair
					});

					library.sequence.add(function (cb) {
						modules.transactions.receiveTransactions([transaction], cb);
					}, function (err) {
						if (err) {
							return res.json({success: false, error: err.toString()});
						}

						res.json({success: true, transactionId: transaction.id});
					});
				});
			});
		});
	});

	router.use(function (req, res, next) {
		res.status(500).send({success: false, error: errorCode('COMMON.INVALID_API')});
	});

	library.network.app.use('/api/transactions', router);
	library.network.app.use(function (err, req, res, next) {
		if (!err) return next();
		library.logger.error(req.url, err.toString());
		res.status(500).send({success: false, error: err.toString()});
	});
}

private.list = function (filter, cb) {
	var sortFields = ['t.id', 't.blockId', 't.type', 't.timestamp', 't.senderPublicKey', 't.senderId', 't.recipientId', 't.senderUsername', 't.recipientUsername', 't.amount', 't.fee', 't.signature', 't.signSignature', 't.confirmations', 'b.height'];
	var params = {}, fields_or = [], owner = "";
	if (filter.blockId) {
		fields_or.push('blockId = $blockId')
		params.blockId = filter.blockId;
	}
	if (filter.senderPublicKey) {
		fields_or.push('lower(hex(senderPublicKey)) = $senderPublicKey')
		params.senderPublicKey = filter.senderPublicKey;
	}
	if (filter.senderId) {
		fields_or.push('senderId = $senderId');
		params.senderId = filter.senderId;
	}
	if (filter.recipientId) {
		fields_or.push('recipientId = $recipientId')
		params.recipientId = filter.recipientId;
	}
	if (filter.senderUsername) {
		fields_or.push('senderUsername = $senderUsername');
		params.senderUsername = filter.senderUsername;
	}
	if (filter.recipientUsername) {
		fields_or.push('recipientUsername = $recipientUsername')
		params.recipientUsername = filter.recipientUsername;
	}
	if (filter.ownerAddress && filter.ownerPublicKey) {
		owner = '(lower(hex(senderPublicKey)) = $ownerPublicKey or recipientId = $ownerAddress)';
		params.ownerPublicKey = filter.ownerPublicKey;
		params.ownerAddress = filter.ownerAddress;
	}
	if (filter.limit) {
		params.limit = filter.limit;
	}
	if (filter.offset) {
		params.offset = filter.offset;
	}

	if (filter.orderBy) {
		var sort = filter.orderBy.split(':');
		var sortBy = sort[0].replace(/[^\w_]/gi, '').replace('_', '.');
		if (sort.length == 2) {
			var sortMethod = sort[1] == 'desc' ? 'desc' : 'asc'
		} else {
			sortMethod = "desc";
		}
	}

	if (sortBy) {
		if (sortFields.indexOf(sortBy) < 0) {
			return cb("Invalid field to sort");
		}
	}

	if (filter.limit > 100) {
		return cb('Maximum of limit is 100');
	}

	library.dbLite.query("select count(t.id) " +
	"from trs t " +
	"inner join blocks b on t.blockId = b.id " +
	(fields_or.length || owner ? "where " : "") + " " +
	(fields_or.length ? "(" + fields_or.join(' or ') + ") " : "") + (fields_or.length && owner ? " and " + owner : owner), params, {"count": Number}, function (err, rows) {
		if (err) {
			return cb(err);
		}

		var count = rows.length ? rows[0].count : 0;

		// need to fix 'or' or 'and' in query
		library.dbLite.query("select t.id, b.height, t.blockId, t.type, t.timestamp, lower(hex(t.senderPublicKey)), t.senderId, t.recipientId, t.senderUsername, t.recipientUsername, t.amount, t.fee, lower(hex(t.signature)), lower(hex(t.signSignature)), (select max(height) + 1 from blocks) - b.height " +
		"from trs t " +
		"inner join blocks b on t.blockId = b.id " +
		(fields_or.length || owner ? "where " : "") + " " +
		(fields_or.length ? "(" + fields_or.join(' or ') + ") " : "") + (fields_or.length && owner ? " and " + owner : owner) + " " +
		(filter.orderBy ? 'order by ' + sortBy + ' ' + sortMethod : '') + " " +
		(filter.limit ? 'limit $limit' : '') + " " +
		(filter.offset ? 'offset $offset' : ''), params, ['t_id', 'b_height', 't_blockId', 't_type', 't_timestamp', 't_senderPublicKey', 't_senderId', 't_recipientId', 't_senderUsername', 't_recipientUsername', 't_amount', 't_fee', 't_signature', 't_signSignature', 'confirmations'], function (err, rows) {
			if (err) {
				return cb(err);
			}

			var transactions = [];
			for (var i = 0; i < rows.length; i++) {
				transactions.push(library.logic.transaction.dbRead(rows[i]));
			}
			var data = {
				transactions: transactions,
				count: count
			}
			cb(null, data);
		});
	});
}

private.getById = function (id, cb) {
	library.dbLite.query("select t.id, b.height, t.blockId, t.type, t.timestamp, lower(hex(t.senderPublicKey)), t.senderId, t.recipientId, t.senderUsername, t.recipientUsername, t.amount, t.fee, lower(hex(t.signature)), lower(hex(t.signSignature)), (select max(height) + 1 from blocks) - b.height " +
	"from trs t " +
	"inner join blocks b on t.blockId = b.id " +
	"where t.id = $id", {id: id}, ['t_id', 'b_height', 't_blockId', 't_type', 't_timestamp', 't_senderPublicKey', 't_senderId', 't_recipientId', 't_senderUsername', 't_recipientUsername', 't_amount', 't_fee', 't_signature', 't_signSignature', 'confirmations'], function (err, rows) {
		if (err || !rows.length) {
			return cb(err || "Can't find transaction: " + id);
		}

		var transacton = library.logic.transaction.dbRead(rows[0]);
		cb(null, transacton);
	});
}

private.addUnconfirmedTransaction = function (transaction, cb) {
	self.applyUnconfirmed(transaction, function (err) {
		if (err) {
			self.addDoubleSpending(transaction);
			return setImmediate(cb, err);
		}

		private.unconfirmedTransactions.push(transaction);
		var index = private.unconfirmedTransactions.length - 1;
		private.unconfirmedTransactionsIdIndex[transaction.id] = index;

		setImmediate(cb);
	});
}

//public methods
Transactions.prototype.getUnconfirmedTransaction = function (id) {
	var index = private.unconfirmedTransactionsIdIndex[id];
	return private.unconfirmedTransactions[index];
}

Transactions.prototype.addDoubleSpending = function (transaction) {
	private.doubleSpendingTransactions[transaction.id] = transaction;
}

Transactions.prototype.pushHiddenTransaction = function (transaction) {
	private.hiddenTransactions.push(transaction);
}

Transactions.prototype.shiftHiddenTransaction = function () {
	return private.hiddenTransactions.shift();
}

Transactions.prototype.deleteHiddenTransaction = function () {
	private.hiddenTransactions = [];
}

Transactions.prototype.getUnconfirmedTransactionList = function (reverse) {
	var a = [];
	for (var i = 0; i < private.unconfirmedTransactions.length; i++) {
		if (private.unconfirmedTransactions[i] !== false) {
			a.push(private.unconfirmedTransactions[i]);
		}
	}

	return reverse ? a.reverse() : a;
}

Transactions.prototype.removeUnconfirmedTransaction = function (id) {
	var index = private.unconfirmedTransactionsIdIndex[id];
	delete private.unconfirmedTransactionsIdIndex[id];
	private.unconfirmedTransactions[index] = false;
}

Transactions.prototype.processUnconfirmedTransaction = function (transaction, broadcast, cb) {
	function done(err) {
		if (err) {
			return cb(err);
		}

		private.addUnconfirmedTransaction(transaction, function (err) {
			if (err) {
				return cb(err);
			}

			library.bus.message('unconfirmedTransaction', transaction, broadcast);

			cb();
		});
	}

	modules.accounts.getAccount({publicKey: transaction.senderPublicKey}, function (err, sender) {
		if (err) {
			return done(err);
		}

		if (!library.logic.transaction.ready(transaction, sender)) {
			return done();
		}

		library.logic.transaction.process(transaction, sender, function (err, transaction) {
			if (err) {
				return done(err);
			}

			// check in confirmed transactions
			if (private.unconfirmedTransactionsIdIndex[transaction.id] !== undefined || private.doubleSpendingTransactions[transaction.id]) {
				return cb("This transaction already exists");
			}

			library.logic.transaction.verify(transaction, sender, done);
		});
	});
}

Transactions.prototype.applyUnconfirmedList = function (ids, cb) {
	async.eachSeries(ids, function (id, cb) {
		var transaction = self.getUnconfirmedTransaction(id)
		self.applyUnconfirmed(transaction, function (err) {
			if (err) {
				self.removeUnconfirmedTransaction(id);
				self.addDoubleSpending(transaction);
			}
			setImmediate(cb);
		});
	}, cb);
}

Transactions.prototype.undoUnconfirmedList = function (cb) {
	var ids = [];
	async.eachSeries(private.unconfirmedTransactions, function (transaction, cb) {
		if (transaction !== false) {
			ids.push(transaction.id);
			self.undoUnconfirmed(transaction, cb);
		} else {
			setImmediate(cb);
		}
	}, function (err) {
		cb(err, ids);
	})
}

Transactions.prototype.apply = function (transaction, cb) {
	modules.accounts.getAccount({publicKey: transaction.senderPublicKey}, function (err, sender) {
		if (err) {
			return cb(err);
		}
		library.logic.transaction.apply(transaction, sender, cb);
	});
}

Transactions.prototype.undo = function (transaction, cb) {
	modules.accounts.getAccount({publicKey: transaction.senderPublicKey}, function (err, sender) {
		if (err) {
			return cb(err);
		}
		library.logic.transaction.undo(transaction, sender, cb);
	});
}

Transactions.prototype.applyUnconfirmed = function (transaction, cb) {
	modules.accounts.getAccount({publicKey: transaction.senderPublicKey}, function (err, sender) {
		if (err) {
			return cb(err);
		}
		if (!sender && transaction.blockId != genesisblock.block.id) {
			return cb('Failed account: ' + transaction.id);
		} else {
			library.logic.transaction.applyUnconfirmed(transaction, sender, cb);
		}
	});
}

Transactions.prototype.undoUnconfirmed = function (transaction, cb) {
	modules.accounts.getAccount({publicKey: transaction.senderPublicKey}, function (err, sender) {
		if (err) {
			return cb(err);
		}
		library.logic.transaction.undoUnconfirmed(transaction, sender, cb);
	});
}

Transactions.prototype.receiveTransactions = function (transactions, cb) {
	async.eachSeries(transactions, function (transaction, cb) {
		self.processUnconfirmedTransaction(transaction, true, cb);
	}, cb);
}

//events
Transactions.prototype.onBind = function (scope) {
	modules = scope;
}

//export
module.exports = Transactions;