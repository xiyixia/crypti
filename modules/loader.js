var async = require('async');
var Router = require('../helpers/router.js');
var util = require('util');
var genesisBlock = require("../helpers/genesisblock.js")

//private
var modules, library, self, loaded;
var total = 0;

//constructor
function Loader(cb, scope) {
	library = scope;
	loaded = false;
	self = this;

	var router = new Router();

	router.get('/status', function (req, res) {
		if (modules.blocks.getLastBlock()) {
			return res.json({
				success: true,
				loaded: self.loaded(),
				now: modules.blocks.getLastBlock().height,
				blocksCount: total
			});
		} else {
			return res.json({success: false});
		}
	})

	library.app.use('/api/loader', router);

	cb(null, this);
}

Loader.prototype.loaded = function () {
	return loaded;
}

//public
Loader.prototype.run = function (scope) {
	modules = scope;

	var offset = 0, limit = 1000;
	modules.blocks.count(function (err, count) {
		total = count;
		library.logger.info('blocks ' + count)
		async.until(
			function () {
				return count < offset
			}, function (cb) {
				library.logger.info('current ' + offset);
				process.nextTick(function () {
					modules.blocks.loadBlocksPart(limit, offset, null, true, function (err) {
						offset = offset + limit;
						cb(err)
					});
				})
			}, function (err) {
				if (err) {
					library.logger.error(err);
					if (err.block) {
						library.logger.error('blockchain failed at ', err.block.height)
						modules.blocks.deleteById(err.block.id, function (err, res) {
							loaded = true;
							library.logger.error('blockchain clipped');
							library.bus.message('blockchainReady');
						})
					}
				} else {
					loaded = true;
					library.logger.info('blockchain ready');
					library.bus.message('blockchainReady');
				}
			}
		)
	})
}

Loader.prototype.updatePeerList = function (cb) {
	modules.transport.getFromRandomPeer('/list', function (err, data) {
		if (!err) {
			async.eachLimit(data.body.peers, 2, function (peer, cb) {
				modules.peer.update(peer, cb);
			}, cb)
		} else {
			cb(err);
		}
	});
}

Loader.prototype.loadBlocks = function (cb) {
	modules.transport.getFromRandomPeer('/weight', function (err, data) {
		if (err) {
			return cb(err);
		} else {
			if (modules.blocks.getWeight().lt(data.body.weight)) {
				if (modules.blocks.getLastBlock().id != genesisBlock.blockId) {
					modules.blocks.getMilestoneBlock(data.peer, function (err, milestoneBlock) {
						if (err) {
							return cb(err);
						} else {
							modules.blocks.getCommonBlock(milestoneBlock, data.peer, function (err, commonBlock) {
								if (err) {
									return cb(err);
								} else {
									// load blocks from common
								}
							})
						}
					})
				} else {
					var commonBlock = genesisBlock.blockId;
					modules.blocks.loadBlocksFromPeer(data.peer, commonBlock, function (err) {
						return cb(err);
					})
				}
			} else {
				return cb();
			}
		}
	});
}

Loader.prototype.getUnconfirmedTransactions = function (cb) {
	modules.transport.getFromRandomPeer('/transactions', function (err, data) {
		cb(err, data.body)
	});
}

Loader.prototype.onPeerReady = function () {
	process.nextTick(function nextUpdatePeerList() {
		self.updatePeerList(function () {
			setTimeout(nextUpdatePeerList, 60 * 1000);

			process.nextTick(function nextLoadBlock() {
				self.loadBlocks(function () {
					// 10 seconds for testing
					setTimeout(nextLoadBlock, 10 * 1000)
				})
			});

			process.nextTick(function nextGetUnconfirmedTransactions() {
				self.getUnconfirmedTransactions(function () {
					setTimeout(nextGetUnconfirmedTransactions, 15 * 1000)
				})
			});
		})
	});
}

Loader.prototype.onBlockchainReady = function () {
	//modules.blocks.count(function (err, count) {
	//	console.log('before', count);
	//	library.db.all('select b.id, t.id from blocks b ' +
	//	'left outer join trs t on t.blockId = b.id ' +
	//	"where b.height >= (SELECT height FROM blocks where id = '4256538783591516150')", function (err, res) {
	//		console.log('rows before', err, res ? res.length : 0)
	//
	//		modules.blocks.deleteById('4256538783591516150', function (err, res) {
	//			console.log('ok', err, res);
	//			modules.blocks.count(function (err, count) {
	//				console.log('after', count);
	//				library.db.all('select b.id, t.id from blocks b ' +
	//				'left outer join trs t on t.blockId = b.id ' +
	//				"where b.height >= (SELECT height FROM blocks where id = '4256538783591516150')", function (err, res) {
	//					console.log('rows after', err, res ? res.length : 0)
	//				})
	//			});
	//		})
	//	})
	//})
}

//export
module.exports = Loader;