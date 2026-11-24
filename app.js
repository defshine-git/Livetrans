// ==========================================
// Embedded QRCode Generator (Kazuhiko Arase / MIT License)
// ==========================================
(function(global) {
// --- QRMode.js ---
var QRMode = {
    MODE_NUMBER :       1 << 0,
    MODE_ALPHA_NUM :    1 << 1,
    MODE_8BIT_BYTE :    1 << 2,
    MODE_KANJI :        1 << 3
};

// --- QR8bitByte.js ---
function QR8bitByte(data) {
	this.mode = QRMode.MODE_8BIT_BYTE;
	this.data = data;
}

QR8bitByte.prototype = {

	getLength : function() {
		return this.data.length;
	},
	
	write : function(buffer) {
		for (var i = 0; i < this.data.length; i++) {
			buffer.put(this.data.charCodeAt(i), 8);
		}
	}
};

// --- QRBitBuffer.js ---
function QRBitBuffer() {
	this.buffer = [];
	this.length = 0;
}

QRBitBuffer.prototype = {

	get : function(index) {
		var bufIndex = Math.floor(index / 8);
		return ( (this.buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
	},
	
	put : function(num, length) {
		for (var i = 0; i < length; i++) {
			this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
		}
	},
	
	getLengthInBits : function() {
		return this.length;
	},
	
	putBit : function(bit) {
	
		var bufIndex = Math.floor(this.length / 8);
		if (this.buffer.length <= bufIndex) {
			this.buffer.push(0);
		}
	
		if (bit) {
			this.buffer[bufIndex] |= (0x80 >>> (this.length % 8) );
		}
	
		this.length++;
	}
};

// --- QRErrorCorrectLevel.js ---
var QRErrorCorrectLevel = {
	L : 1,
	M : 0,
	Q : 3,
	H : 2
};

// --- QRMaskPattern.js ---
var QRMaskPattern = {
	PATTERN000 : 0,
	PATTERN001 : 1,
	PATTERN010 : 2,
	PATTERN011 : 3,
	PATTERN100 : 4,
	PATTERN101 : 5,
	PATTERN110 : 6,
	PATTERN111 : 7
};

// --- QRMath.js ---
var QRMath = {

	glog : function(n) {
	
		if (n < 1) {
			throw new Error("glog(" + n + ")");
		}
		
		return QRMath.LOG_TABLE[n];
	},
	
	gexp : function(n) {
	
		while (n < 0) {
			n += 255;
		}
	
		while (n >= 256) {
			n -= 255;
		}
	
		return QRMath.EXP_TABLE[n];
	},
	
	EXP_TABLE : new Array(256),
	
	LOG_TABLE : new Array(256)

};
	
for (var i = 0; i < 8; i++) {
	QRMath.EXP_TABLE[i] = 1 << i;
}
for (var i = 8; i < 256; i++) {
	QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4]
		^ QRMath.EXP_TABLE[i - 5]
		^ QRMath.EXP_TABLE[i - 6]
		^ QRMath.EXP_TABLE[i - 8];
}
for (var i = 0; i < 255; i++) {
	QRMath.LOG_TABLE[QRMath.EXP_TABLE[i] ] = i;
}

// --- QRPolynomial.js ---
function QRPolynomial(num, shift) {
	if (num.length === undefined) {
		throw new Error(num.length + "/" + shift);
	}

	var offset = 0;

	while (offset < num.length && num[offset] === 0) {
		offset++;
	}

	this.num = new Array(num.length - offset + shift);
	for (var i = 0; i < num.length - offset; i++) {
		this.num[i] = num[i + offset];
	}
}

QRPolynomial.prototype = {

	get : function(index) {
		return this.num[index];
	},
	
	getLength : function() {
		return this.num.length;
	},
	
	multiply : function(e) {
	
		var num = new Array(this.getLength() + e.getLength() - 1);
	
		for (var i = 0; i < this.getLength(); i++) {
			for (var j = 0; j < e.getLength(); j++) {
				num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i) ) + QRMath.glog(e.get(j) ) );
			}
		}
	
		return new QRPolynomial(num, 0);
	},
	
	mod : function(e) {
	
		if (this.getLength() - e.getLength() < 0) {
			return this;
		}
	
		var ratio = QRMath.glog(this.get(0) ) - QRMath.glog(e.get(0) );
	
		var num = new Array(this.getLength() );
		
		for (var i = 0; i < this.getLength(); i++) {
			num[i] = this.get(i);
		}
		
		for (var x = 0; x < e.getLength(); x++) {
			num[x] ^= QRMath.gexp(QRMath.glog(e.get(x) ) + ratio);
		}
	
		return new QRPolynomial(num, 0).mod(e);
	}
};

// --- QRRSBlock.js ---
function QRRSBlock(totalCount, dataCount) {
	this.totalCount = totalCount;
	this.dataCount  = dataCount;
}

QRRSBlock.RS_BLOCK_TABLE = [
	// 1
	[1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9],
	// 2
	[1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16],
	// 3
	[1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13],
	// 4		
	[1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9],
	// 5
	[1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12],
	// 6
	[2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15],
	// 7		
	[2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14],
	// 8
	[2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15],
	// 9
	[2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13],
	// 10		
	[2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16],
	// 11
	[4, 101, 81], [1, 80, 50, 4, 81, 51], [4, 50, 22, 4, 51, 23], [3, 36, 12, 8, 37, 13],
	// 12
	[2, 116, 92, 2, 117, 93], [6, 58, 36, 2, 59, 37], [4, 46, 20, 6, 47, 21], [7, 42, 14, 4, 43, 15],
	// 13
	[4, 133, 107], [8, 59, 37, 1, 60, 38], [8, 44, 20, 4, 45, 21], [12, 33, 11, 4, 34, 12],
	// 14
	[3, 145, 115, 1, 146, 116], [4, 64, 40, 5, 65, 41], [11, 36, 16, 5, 37, 17], [11, 36, 12, 5, 37, 13],
	// 15
	[5, 109, 87, 1, 110, 88], [5, 65, 41, 5, 66, 42], [5, 54, 24, 7, 55, 25], [11, 36, 12],
	// 16
	[5, 122, 98, 1, 123, 99], [7, 73, 45, 3, 74, 46], [15, 43, 19, 2, 44, 20], [3, 45, 15, 13, 46, 16],
	// 17
	[1, 135, 107, 5, 136, 108], [10, 74, 46, 1, 75, 47], [1, 50, 22, 15, 51, 23], [2, 42, 14, 17, 43, 15],
	// 18
	[5, 150, 120, 1, 151, 121], [9, 69, 43, 4, 70, 44], [17, 50, 22, 1, 51, 23], [2, 42, 14, 19, 43, 15],
	// 19
	[3, 141, 113, 4, 142, 114], [3, 70, 44, 11, 71, 45], [17, 47, 21, 4, 48, 22], [9, 39, 13, 16, 40, 14],
	// 20
	[3, 135, 107, 5, 136, 108], [3, 67, 41, 13, 68, 42], [15, 54, 24, 5, 55, 25], [15, 43, 15, 10, 44, 16],
	// 21
	[4, 144, 116, 4, 145, 117], [17, 68, 42], [17, 50, 22, 6, 51, 23], [19, 46, 16, 6, 47, 17],
	// 22
	[2, 139, 111, 7, 140, 112], [17, 74, 46], [7, 54, 24, 16, 55, 25], [34, 37, 13],
	// 23
	[4, 151, 121, 5, 152, 122], [4, 75, 47, 14, 76, 48], [11, 54, 24, 14, 55, 25], [16, 45, 15, 14, 46, 16],
	// 24
	[6, 147, 117, 4, 148, 118], [6, 73, 45, 14, 74, 46], [11, 54, 24, 16, 55, 25], [30, 46, 16, 2, 47, 17],
	// 25
	[8, 132, 106, 4, 133, 107], [8, 75, 47, 13, 76, 48], [7, 54, 24, 22, 55, 25], [22, 45, 15, 13, 46, 16],
	// 26
	[10, 142, 114, 2, 143, 115], [19, 74, 46, 4, 75, 47], [28, 50, 22, 6, 51, 23], [33, 46, 16, 4, 47, 17],
	// 27
	[8, 152, 122, 4, 153, 123], [22, 73, 45, 3, 74, 46], [8, 53, 23, 26, 54, 24], [12, 45, 15, 28, 46, 16],
	// 28
	[3, 147, 117, 10, 148, 118], [3, 73, 45, 23, 74, 46], [4, 54, 24, 31, 55, 25], [11, 45, 15, 31, 46, 16],
	// 29
	[7, 146, 116, 7, 147, 117], [21, 73, 45, 7, 74, 46], [1, 53, 23, 37, 54, 24], [19, 45, 15, 26, 46, 16],
	// 30
	[5, 145, 115, 10, 146, 116], [19, 75, 47, 10, 76, 48], [15, 54, 24, 25, 55, 25], [23, 45, 15, 25, 46, 16],
	// 31
	[13, 145, 115, 3, 146, 116], [2, 74, 46, 29, 75, 47], [42, 54, 24, 1, 55, 25], [23, 45, 15, 28, 46, 16],
	// 32
	[17, 145, 115], [10, 74, 46, 23, 75, 47], [10, 54, 24, 35, 55, 25], [19, 45, 15, 35, 46, 16],
	// 33
	[17, 145, 115, 1, 146, 116], [14, 74, 46, 21, 75, 47], [29, 54, 24, 19, 55, 25], [11, 45, 15, 46, 46, 16],
	// 34
	[13, 145, 115, 6, 146, 116], [14, 74, 46, 23, 75, 47], [44, 54, 24, 7, 55, 25], [59, 46, 16, 1, 47, 17],
	// 35
	[12, 151, 121, 7, 152, 122], [12, 75, 47, 26, 76, 48], [39, 54, 24, 14, 55, 25], [22, 45, 15, 41, 46, 16],
	// 36
	[6, 151, 121, 14, 152, 122], [6, 75, 47, 34, 76, 48], [46, 54, 24, 10, 55, 25], [2, 45, 15, 64, 46, 16],
	// 37
	[17, 152, 122, 4, 153, 123], [29, 74, 46, 14, 75, 47], [49, 54, 24, 10, 55, 25], [24, 45, 15, 46, 46, 16],
	// 38
	[4, 152, 122, 18, 153, 123], [13, 74, 46, 32, 75, 47], [48, 54, 24, 14, 55, 25], [42, 45, 15, 32, 46, 16],
	// 39
	[20, 147, 117, 4, 148, 118], [40, 75, 47, 7, 76, 48], [43, 54, 24, 22, 55, 25], [10, 45, 15, 67, 46, 16],
	// 40
	[19, 148, 118, 6, 149, 119], [18, 75, 47, 31, 76, 48], [34, 54, 24, 34, 55, 25], [20, 45, 15, 61, 46, 16]
];

QRRSBlock.getRSBlocks = function(typeNumber, errorCorrectLevel) {
	var rsBlock = QRRSBlock.getRsBlockTable(typeNumber, errorCorrectLevel);
	if (rsBlock === undefined) {
		throw new Error("bad rs block @ typeNumber:" + typeNumber + "/errorCorrectLevel:" + errorCorrectLevel);
	}
	var length = rsBlock.length / 3;
	var list = [];
	for (var i = 0; i < length; i++) {
		var count = rsBlock[i * 3 + 0];
		var totalCount = rsBlock[i * 3 + 1];
		var dataCount  = rsBlock[i * 3 + 2];
		for (var j = 0; j < count; j++) {
			list.push(new QRRSBlock(totalCount, dataCount) );	
		}
	}
	return list;
};

QRRSBlock.getRsBlockTable = function(typeNumber, errorCorrectLevel) {
	switch(errorCorrectLevel) {
	case QRErrorCorrectLevel.L : return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
	case QRErrorCorrectLevel.M : return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
	case QRErrorCorrectLevel.Q : return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
	case QRErrorCorrectLevel.H : return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
	default : return undefined;
	}
};

// --- QRUtil.js ---
var QRUtil = {
    PATTERN_POSITION_TABLE : [
        [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42],
        [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66],
        [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86],
        [6, 34, 62, 90], [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102],
        [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118],
        [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130],
        [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142],
        [6, 34, 62, 90, 118, 146], [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154],
        [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166],
        [6, 30, 58, 86, 114, 142, 170]
    ],

    G15 : (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0),
    G18 : (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0),
    G15_MASK : (1 << 14) | (1 << 12) | (1 << 10)    | (1 << 4) | (1 << 1),

    getBCHTypeInfo : function(data) {
        var d = data << 10;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
            d ^= (QRUtil.G15 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) ) );    
        }
        return ( (data << 10) | d) ^ QRUtil.G15_MASK;
    },

    getBCHTypeNumber : function(data) {
        var d = data << 12;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) {
            d ^= (QRUtil.G18 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) ) );    
        }
        return (data << 12) | d;
    },

    getBCHDigit : function(data) {
        var digit = 0;
        while (data !== 0) {
            digit++;
            data >>>= 1;
        }
        return digit;
    },

    getPatternPosition : function(typeNumber) {
        return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1];
    },

    getMask : function(maskPattern, i, j) {
        switch (maskPattern) {
        case QRMaskPattern.PATTERN000 : return (i + j) % 2 === 0;
        case QRMaskPattern.PATTERN001 : return i % 2 === 0;
        case QRMaskPattern.PATTERN010 : return j % 3 === 0;
        case QRMaskPattern.PATTERN011 : return (i + j) % 3 === 0;
        case QRMaskPattern.PATTERN100 : return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 === 0;
        case QRMaskPattern.PATTERN101 : return (i * j) % 2 + (i * j) % 3 === 0;
        case QRMaskPattern.PATTERN110 : return ( (i * j) % 2 + (i * j) % 3) % 2 === 0;
        case QRMaskPattern.PATTERN111 : return ( (i * j) % 3 + (i + j) % 2) % 2 === 0;
        default : throw new Error("bad maskPattern:" + maskPattern);
        }
    },

    getErrorCorrectPolynomial : function(errorCorrectLength) {
        var a = new QRPolynomial([1], 0);
        for (var i = 0; i < errorCorrectLength; i++) {
            a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0) );
        }
        return a;
    },

    getLengthInBits : function(mode, type) {
        if (1 <= type && type < 10) {
            switch(mode) {
            case QRMode.MODE_NUMBER     : return 10;
            case QRMode.MODE_ALPHA_NUM  : return 9;
            case QRMode.MODE_8BIT_BYTE  : return 8;
            case QRMode.MODE_KANJI      : return 8;
            default : throw new Error("mode:" + mode);
            }
        } else if (type < 27) {
            switch(mode) {
            case QRMode.MODE_NUMBER     : return 12;
            case QRMode.MODE_ALPHA_NUM  : return 11;
            case QRMode.MODE_8BIT_BYTE  : return 16;
            case QRMode.MODE_KANJI      : return 10;
            default : throw new Error("mode:" + mode);
            }
        } else if (type < 41) {
            switch(mode) {
            case QRMode.MODE_NUMBER     : return 14;
            case QRMode.MODE_ALPHA_NUM  : return 13;
            case QRMode.MODE_8BIT_BYTE  : return 16;
            case QRMode.MODE_KANJI      : return 12;
            default : throw new Error("mode:" + mode);
            }
        } else {
            throw new Error("type:" + type);
        }
    },

    getLostPoint : function(qrCode) {
        var moduleCount = qrCode.getModuleCount();
        var lostPoint = 0;
        var row = 0; 
        var col = 0;

        for (row = 0; row < moduleCount; row++) {
            for (col = 0; col < moduleCount; col++) {
                var sameCount = 0;
                var dark = qrCode.isDark(row, col);
                for (var r = -1; r <= 1; r++) {
                    if (row + r < 0 || moduleCount <= row + r) continue;
                    for (var c = -1; c <= 1; c++) {
                        if (col + c < 0 || moduleCount <= col + c) continue;
                        if (r === 0 && c === 0) continue;
                        if (dark === qrCode.isDark(row + r, col + c) ) sameCount++;
                    }
                }
                if (sameCount > 5) {
                    lostPoint += (3 + sameCount - 5);
                }
            }
        }

        for (row = 0; row < moduleCount - 1; row++) {
            for (col = 0; col < moduleCount - 1; col++) {
                var count = 0;
                if (qrCode.isDark(row,     col    ) ) count++;
                if (qrCode.isDark(row + 1, col    ) ) count++;
                if (qrCode.isDark(row,     col + 1) ) count++;
                if (qrCode.isDark(row + 1, col + 1) ) count++;
                if (count === 0 || count === 4) {
                    lostPoint += 3;
                }
            }
        }

        for (row = 0; row < moduleCount; row++) {
            for (col = 0; col < moduleCount - 6; col++) {
                if (qrCode.isDark(row, col) && 
                        !qrCode.isDark(row, col + 1) && 
                         qrCode.isDark(row, col + 2) && 
                         qrCode.isDark(row, col + 3) && 
                         qrCode.isDark(row, col + 4) && 
                        !qrCode.isDark(row, col + 5) && 
                         qrCode.isDark(row, col + 6) ) {
                    lostPoint += 40;
                }
            }
        }

        for (col = 0; col < moduleCount; col++) {
            for (row = 0; row < moduleCount - 6; row++) {
                if (qrCode.isDark(row, col) &&
                        !qrCode.isDark(row + 1, col) &&
                         qrCode.isDark(row + 2, col) &&
                         qrCode.isDark(row + 3, col) &&
                         qrCode.isDark(row + 4, col) &&
                        !qrCode.isDark(row + 5, col) &&
                         qrCode.isDark(row + 6, col) ) {
                    lostPoint += 40;
                }
            }
        }
        
        var darkCount = 0;
        for (col = 0; col < moduleCount; col++) {
            for (row = 0; row < moduleCount; row++) {
                if (qrCode.isDark(row, col) ) darkCount++;
            }
        }
        var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
        lostPoint += ratio * 10;
        return lostPoint;       
    }
};

function QRCode(typeNumber, errorCorrectLevel) {
	this.typeNumber = typeNumber;
	this.errorCorrectLevel = errorCorrectLevel;
	this.modules = null;
	this.moduleCount = 0;
	this.dataCache = null;
	this.dataList = [];
}

QRCode.prototype = {
	addData : function(data) {
		var newData = new QR8bitByte(data);
		this.dataList.push(newData);
		this.dataCache = null;
	},
	
	isDark : function(row, col) {
		if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) {
			throw new Error(row + "," + col);
		}
		return this.modules[row][col];
	},

	getModuleCount : function() {
		return this.moduleCount;
	},
	
	make : function() {
		if (this.typeNumber < 1 ){
			var typeNumber = 1;
			for (typeNumber = 1; typeNumber <= 40; typeNumber++) {
				var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, this.errorCorrectLevel);

				var buffer = new QRBitBuffer();
				var totalDataCount = 0;
				for (var i = 0; i < rsBlocks.length; i++) {
					totalDataCount += rsBlocks[i].dataCount;
				}

				for (var x = 0; x < this.dataList.length; x++) {
					var data = this.dataList[x];
					buffer.put(data.mode, 4);
					buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber) );
					data.write(buffer);
				}
				if (buffer.getLengthInBits() <= totalDataCount * 8)
					break;
			}
			this.typeNumber = Math.min(40, typeNumber);
		}
		this.makeImpl(false, this.getBestMaskPattern() );
	},
	
	makeImpl : function(test, maskPattern) {
		this.moduleCount = this.typeNumber * 4 + 17;
		this.modules = new Array(this.moduleCount);
		
		for (var row = 0; row < this.moduleCount; row++) {
			this.modules[row] = new Array(this.moduleCount);
			for (var col = 0; col < this.moduleCount; col++) {
				this.modules[row][col] = null;
			}
		}
	
		this.setupPositionProbePattern(0, 0);
		this.setupPositionProbePattern(this.moduleCount - 7, 0);
		this.setupPositionProbePattern(0, this.moduleCount - 7);
		this.setupPositionAdjustPattern();
		this.setupTimingPattern();
		this.setupTypeInfo(test, maskPattern);
		
		if (this.typeNumber >= 7) {
			this.setupTypeNumber(test);
		}
	
		if (this.dataCache === null) {
			this.dataCache = QRCode.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
		}
	
		this.mapData(this.dataCache, maskPattern);
	},

	setupPositionProbePattern : function(row, col)  {
		for (var r = -1; r <= 7; r++) {
			if (row + r <= -1 || this.moduleCount <= row + r) continue;
			for (var c = -1; c <= 7; c++) {
				if (col + c <= -1 || this.moduleCount <= col + c) continue;
				if ( (0 <= r && r <= 6 && (c === 0 || c === 6) ) || 
                     (0 <= c && c <= 6 && (r === 0 || r === 6) ) || 
                     (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
					this.modules[row + r][col + c] = true;
				} else {
					this.modules[row + r][col + c] = false;
				}
			}		
		}		
	},
	
	getBestMaskPattern : function() {
		var minLostPoint = 0;
		var pattern = 0;
		for (var i = 0; i < 8; i++) {
			this.makeImpl(true, i);
			var lostPoint = QRUtil.getLostPoint(this);
			if (i === 0 || minLostPoint > lostPoint) {
				minLostPoint = lostPoint;
				pattern = i;
			}
		}
		return pattern;
	},

	setupTimingPattern : function() {
		for (var r = 8; r < this.moduleCount - 8; r++) {
			if (this.modules[r][6] !== null) continue;
			this.modules[r][6] = (r % 2 === 0);
		}
		for (var c = 8; c < this.moduleCount - 8; c++) {
			if (this.modules[6][c] !== null) continue;
			this.modules[6][c] = (c % 2 === 0);
		}
	},
	
	setupPositionAdjustPattern : function() {
		var pos = QRUtil.getPatternPosition(this.typeNumber);
		for (var i = 0; i < pos.length; i++) {
			for (var j = 0; j < pos.length; j++) {
				var row = pos[i];
				var col = pos[j];
				if (this.modules[row][col] !== null) continue;
				for (var r = -2; r <= 2; r++) {
					for (var c = -2; c <= 2; c++) {
						if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0) ) {
							this.modules[row + r][col + c] = true;
						} else {
							this.modules[row + r][col + c] = false;
						}
					}
				}
			}
		}
	},
	
	setupTypeNumber : function(test) {
		var bits = QRUtil.getBCHTypeNumber(this.typeNumber);
        var mod;
		for (var i = 0; i < 18; i++) {
			mod = (!test && ( (bits >> i) & 1) === 1);
			this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod;
		}
		for (var x = 0; x < 18; x++) {
			mod = (!test && ( (bits >> x) & 1) === 1);
			this.modules[x % 3 + this.moduleCount - 8 - 3][Math.floor(x / 3)] = mod;
		}
	},
	
	setupTypeInfo : function(test, maskPattern) {
		var data = (this.errorCorrectLevel << 3) | maskPattern;
		var bits = QRUtil.getBCHTypeInfo(data);
        var mod;
		for (var v = 0; v < 15; v++) {
			mod = (!test && ( (bits >> v) & 1) === 1);
			if (v < 6) {
				this.modules[v][8] = mod;
			} else if (v < 8) {
				this.modules[v + 1][8] = mod;
			} else {
				this.modules[this.moduleCount - 15 + v][8] = mod;
			}
		}
		for (var h = 0; h < 15; h++) {
			mod = (!test && ( (bits >> h) & 1) === 1);
			if (h < 8) {
				this.modules[8][this.moduleCount - h - 1] = mod;
			} else if (h < 9) {
				this.modules[8][15 - h - 1 + 1] = mod;
			} else {
				this.modules[8][15 - h - 1] = mod;
			}
		}
		this.modules[this.moduleCount - 8][8] = (!test);
	},
	
	mapData : function(data, maskPattern) {
		var inc = -1;
		var row = this.moduleCount - 1;
		var bitIndex = 7;
		var byteIndex = 0;
		
		for (var col = this.moduleCount - 1; col > 0; col -= 2) {
			if (col === 6) col--;
			while (true) {
				for (var c = 0; c < 2; c++) {
					if (this.modules[row][col - c] === null) {
						var dark = false;
						if (byteIndex < data.length) {
							dark = ( ( (data[byteIndex] >>> bitIndex) & 1) === 1);
						}
						var mask = QRUtil.getMask(maskPattern, row, col - c);
						if (mask) {
							dark = !dark;
						}
						this.modules[row][col - c] = dark;
						bitIndex--;
						if (bitIndex === -1) {
							byteIndex++;
							bitIndex = 7;
						}
					}
				}
				row += inc;
				if (row < 0 || this.moduleCount <= row) {
					row -= inc;
					inc = -inc;
					break;
				}
			}
		}
	}
};

QRCode.PAD0 = 0xEC;
QRCode.PAD1 = 0x11;

QRCode.createData = function(typeNumber, errorCorrectLevel, dataList) {
	var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);
	var buffer = new QRBitBuffer();
	
	for (var i = 0; i < dataList.length; i++) {
		var data = dataList[i];
		buffer.put(data.mode, 4);
		buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber) );
		data.write(buffer);
	}

	var totalDataCount = 0;
	for (var x = 0; x < rsBlocks.length; x++) {
		totalDataCount += rsBlocks[x].dataCount;
	}

	if (buffer.getLengthInBits() > totalDataCount * 8) {
		throw new Error("code length overflow. (" + buffer.getLengthInBits() + ">" + totalDataCount * 8 + ")");
	}

	if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
		buffer.put(0, 4);
	}

	while (buffer.getLengthInBits() % 8 !== 0) {
		buffer.putBit(false);
	}

	while (true) {
		if (buffer.getLengthInBits() >= totalDataCount * 8) break;
		buffer.put(QRCode.PAD0, 8);
		if (buffer.getLengthInBits() >= totalDataCount * 8) break;
		buffer.put(QRCode.PAD1, 8);
	}

	return QRCode.createBytes(buffer, rsBlocks);
};

QRCode.createBytes = function(buffer, rsBlocks) {
	var offset = 0;
	var maxDcCount = 0;
	var maxEcCount = 0;
	var dcdata = new Array(rsBlocks.length);
	var ecdata = new Array(rsBlocks.length);
	
	for (var r = 0; r < rsBlocks.length; r++) {
		var dcCount = rsBlocks[r].dataCount;
		var ecCount = rsBlocks[r].totalCount - dcCount;
		maxDcCount = Math.max(maxDcCount, dcCount);
		maxEcCount = Math.max(maxEcCount, ecCount);
		dcdata[r] = new Array(dcCount);
		for (var i = 0; i < dcdata[r].length; i++) {
			dcdata[r][i] = 0xff & buffer.buffer[i + offset];
		}
		offset += dcCount;
		
		var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
		var rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);
		var modPoly = rawPoly.mod(rsPoly);
		ecdata[r] = new Array(rsPoly.getLength() - 1);
		for (var x = 0; x < ecdata[r].length; x++) {
            var modIndex = x + modPoly.getLength() - ecdata[r].length;
			ecdata[r][x] = (modIndex >= 0)? modPoly.get(modIndex) : 0;
		}
	}
	
	var totalCodeCount = 0;
	for (var y = 0; y < rsBlocks.length; y++) {
		totalCodeCount += rsBlocks[y].totalCount;
	}

	var data = new Array(totalCodeCount);
	var index = 0;

	for (var z = 0; z < maxDcCount; z++) {
		for (var s = 0; s < rsBlocks.length; s++) {
			if (z < dcdata[s].length) {
				data[index++] = dcdata[s][z];
			}
		}
	}

	for (var xx = 0; xx < maxEcCount; xx++) {
		for (var t = 0; t < rsBlocks.length; t++) {
			if (xx < ecdata[t].length) {
				data[index++] = ecdata[t][xx];
			}
		}
	}

	return data;
};

QRCode.QRErrorCorrectLevel = QRErrorCorrectLevel;

QRCode.renderCanvas = function(canvas, text, options) {
    options = options || {};
    var targetSize = options.size || 280;
    var margin = options.margin !== undefined ? options.margin : 4;
    var darkColor = options.dark || '#000000';
    var lightColor = options.light || '#FFFFFF';

    var qr = new QRCode(0, QRErrorCorrectLevel.L);
    qr.addData(text);
    qr.make();

    var count = qr.getModuleCount();
    var totalModules = count + margin * 2;
    // 整数ピクセル単位で描画し、隣接ドットのにじみ・潰れを完全に防止
    var cellSize = Math.max(4, Math.ceil(targetSize / totalModules));
    var actualSize = totalModules * cellSize;

    var ctx = canvas.getContext('2d');
    canvas.width = actualSize;
    canvas.height = actualSize;
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = lightColor;
    ctx.fillRect(0, 0, actualSize, actualSize);

    ctx.fillStyle = darkColor;
    for (var r = 0; r < count; r++) {
      for (var c = 0; c < count; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect((c + margin) * cellSize, (r + margin) * cellSize, cellSize, cellSize);
        }
      }
    }

    return {
      version: qr.typeNumber,
      moduleCount: count,
      length: text.length,
      canvasSize: actualSize
    };
};

global.QRCode = QRCode;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));

/**
 * app.js - Optimized Frontend Architecture for Multilingual Transcriber
 * Version: 3.3.0 (UX Overhaul + Complete Multilingual + EN/JA Top Priority + Hindi/Urdu Code-Switching Edition)
 *
 * Modules:
 *  1. Constants & Shared Utilities (Multilingual registry, Code-switch detection, Base64 UTF-8, Timeout fetch)
 *  2. ConfigManager (localStorage persistence)
 *  2.5. VoiceActivityDetector (Pre-Gain VAD with Minimum Statistics noise floor)
 *  3. AudioCaptureService (Anti-aliased 16kHz PCM, far-field boost, iPad/iOS unlock)
 *  4. WebSpeechService (Multilingual Web Speech API fallback)
 *  5. GeminiLiveClient (Tiered EN/JA + HI/UR & 85+ multilingual setup, single `audio` stream, auto-reconnect x5)
 *  6. GeminiTextClient (Shared Gemini REST cascade client for Translation & Summary)
 *  7. TranslationService (FIFO queue, multilingual & Hinglish/Urdu code-switching nuance, prior-context continuity)
 *  8. SummaryService (On-demand lookback structured Japanese summarizer)
 *  9. GasStorageClient (Google Docs single-document sync & GAS multilingual fallback)
 * 10. LongFormUtteranceBuffer (Real-time original display + code-switch-safe chunking + Urdu/RTL punctuation)
 * 11. App (Modular UI controller with concurrency locks & DOM bounds)
 */

// ==========================================
// 1. Constants & Shared Utilities
// ==========================================
const APP_VERSION = '3.3.0';

const DEFAULT_SETTINGS = Object.freeze({
  DEFAULT_FOLDER_ID: '15THrUI5WmO-aQIV7Nr5345jZEBOKDb8f',
  DEFAULT_LIVE_MODEL: 'models/gemini-3.5-transcribe-live',
  DEFAULT_CATEGORY: 'Common',
  DEFAULT_RECOGNITION_PROFILE: 'ja-en-hi-ur',
  DEFAULT_PARTNER_LANG: 'en',
  DEFAULT_CUSTOM_LANGS: Object.freeze(['ja', 'en', 'hi', 'ur', 'bn']),
  GEMINI_TEXT_MODELS: Object.freeze([
    'gemini-3.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash'
  ]),
  MAX_LOG_LINES: 300
});

const LANGUAGE_REGISTRY = Object.freeze({
  ja: { code: 'ja', name: '日本語', englishName: 'Japanese', badge: '🇯🇵', bcp47: ['ja-JP'], speechLang: 'ja-JP', rtl: false },
  en: { code: 'en', name: '英語', englishName: 'English', badge: '🇺🇸', bcp47: ['en-US', 'en-IN'], speechLang: 'en-US', rtl: false },
  hi: { code: 'hi', name: 'ヒンディー語', englishName: 'Hindi (हिन्दी)', badge: '🇮🇳', bcp47: ['hi-IN'], speechLang: 'hi-IN', rtl: false },
  ur: { code: 'ur', name: 'ウルドゥー語', englishName: 'Urdu (اردو)', badge: '🇵🇰', bcp47: ['ur-PK'], speechLang: 'ur-PK', rtl: true },
  bn: { code: 'bn', name: 'ベンガル語', englishName: 'Bengali (বাংলা)', badge: '🇧🇩', bcp47: ['bn-BD', 'bn-IN'], speechLang: 'bn-BD', rtl: false },
  zh: { code: 'zh', name: '中国語', englishName: 'Chinese (中文)', badge: '🇨🇳', bcp47: ['cmn-Hans-CN', 'zh-TW'], speechLang: 'zh-CN', rtl: false },
  ko: { code: 'ko', name: '韓国語', englishName: 'Korean (한국어)', badge: '🇰🇷', bcp47: ['ko-KR'], speechLang: 'ko-KR', rtl: false },
  vi: { code: 'vi', name: 'ベトナム語', englishName: 'Vietnamese (Tiếng Việt)', badge: '🇻🇳', bcp47: ['vi-VN'], speechLang: 'vi-VN', rtl: false },
  id: { code: 'id', name: 'インドネシア語', englishName: 'Indonesian (Bahasa Indonesia)', badge: '🇮🇩', bcp47: ['id-ID'], speechLang: 'id-ID', rtl: false },
  tl: { code: 'tl', name: 'タガログ語', englishName: 'Filipino / Tagalog', badge: '🇵🇭', bcp47: ['fil-PH'], speechLang: 'fil-PH', rtl: false },
  th: { code: 'th', name: 'タイ語', englishName: 'Thai (ไทย)', badge: '🇹🇭', bcp47: ['th-TH'], speechLang: 'th-TH', rtl: false },
  my: { code: 'my', name: 'ミャンマー語', englishName: 'Burmese (မြန်မာ)', badge: '🇲🇲', bcp47: ['my-MM'], speechLang: 'my-MM', rtl: false },
  ar: { code: 'ar', name: 'アラビア語', englishName: 'Arabic (العربية)', badge: '🇸🇦', bcp47: ['ar-SA'], speechLang: 'ar-SA', rtl: true },
  fa: { code: 'fa', name: 'ペルシア語', englishName: 'Persian (فارسی)', badge: '🇮🇷', bcp47: ['fa-IR'], speechLang: 'fa-IR', rtl: true },
  tr: { code: 'tr', name: 'トルコ語', englishName: 'Turkish (Türkçe)', badge: '🇹🇷', bcp47: ['tr-TR'], speechLang: 'tr-TR', rtl: false },
  es: { code: 'es', name: 'スペイン語', englishName: 'Spanish (Español)', badge: '🇪🇸', bcp47: ['es-ES'], speechLang: 'es-ES', rtl: false },
  fr: { code: 'fr', name: 'フランス語', englishName: 'French (Français)', badge: '🇫🇷', bcp47: ['fr-FR'], speechLang: 'fr-FR', rtl: false },
  de: { code: 'de', name: 'ドイツ語', englishName: 'German (Deutsch)', badge: '🇩🇪', bcp47: ['de-DE'], speechLang: 'de-DE', rtl: false },
  pt: { code: 'pt', name: 'ポルトガル語', englishName: 'Portuguese (Português)', badge: '🇧🇷', bcp47: ['pt-BR'], speechLang: 'pt-BR', rtl: false },
  ru: { code: 'ru', name: 'ロシア語', englishName: 'Russian (Русский)', badge: '🇷🇺', bcp47: ['ru-RU'], speechLang: 'ru-RU', rtl: false },
  it: { code: 'it', name: 'イタリア語', englishName: 'Italian (Italiano)', badge: '🇮🇹', bcp47: ['it-IT'], speechLang: 'it-IT', rtl: false }
});

// 後方互換エイリアス
const LANGUAGE_META = LANGUAGE_REGISTRY;

const RECOGNITION_PROFILES = Object.freeze({
  'ja-en-hi-ur': {
    label: '日英最優先 ＋ ヒンディー/ウルドゥー補足',
    languageCodes: Object.freeze(['ja-JP', 'en-US', 'en-IN', 'hi-IN', 'ur-PK'])
  },
  'multilingual-auto': {
    label: '完全多言語 (85+言語自動判別・日英優先)',
    languageCodes: Object.freeze([])
  },
  'multilingual-custom': {
    label: 'カスタム言語セット',
    languageCodes: null
  },
  'strict-ja-en': {
    label: '日英2言語のみ厳密ロック',
    languageCodes: Object.freeze(['ja-JP', 'en-US', 'en-IN'])
  }
});

const CUSTOM_LANG_PRESETS = Object.freeze({
  'south-asia': Object.freeze(['ja', 'en', 'hi', 'ur', 'bn']),
  'asia': Object.freeze(['ja', 'en', 'zh', 'ko', 'vi', 'id', 'tl', 'th', 'my', 'hi', 'ur', 'bn']),
  'global': Object.freeze(['ja', 'en', 'hi', 'ur', 'zh', 'ko', 'es', 'fr', 'de', 'ar'])
});

const ROLES = Object.freeze([
  'Auditor (監査員)',
  'Yard Rep (ヤード担当者)',
  'Facility (施設側)',
  'Other (その他)'
]);

const ROLE_SHORT_LABELS = Object.freeze({
  'Auditor (監査員)': 'Auditor',
  'Yard Rep (ヤード担当者)': 'Yard',
  'Facility (施設側)': 'Facility',
  'Other (その他)': 'Other'
});

const LEGACY_V311_SYSTEM_INSTRUCTION =
  'You are a speech transcription engine for maritime and safety audits. ' +
  'You must ONLY transcribe speech into one of these four languages: Japanese (日本語), English, Bengali (বাংলা), or Hindi (हिन्दी). ' +
  'Do not transcribe speech into Korean, Swahili, or any other unlisted language. ' +
  'In shipyard contexts (e.g. Bangladesh / India), local personnel often speak in English with Bengali or Hindi words mixed in (code-mixing). ' +
  'If audio resembles Japanese phonetics, strictly transcribe it in Japanese characters.';

const DEFAULT_SYSTEM_INSTRUCTION =
  'You are a high-precision real-time speech transcription engine. ' +
  '1. TOP PRIORITY (ENGLISH & JAPANESE): Give highest priority to accurate English and Japanese (日本語) transcription. ' +
  'Whenever speech can reasonably be understood as English (including Indian, Pakistani, Japanese, or other non-native accents, technical terms, and abbreviations) or Japanese, ALWAYS transcribe it in standard English or natural Japanese characters. ' +
  '2. HINDI & URDU IN ENGLISH CONVERSATION (CODE-SWITCHING): Speakers chatting in English may occasionally mix in casual Hindi (हिन्दी) or Urdu (اردو) words, greetings, fillers, or short side-remarks (Hinglish / Urdu-English code-switching, such as "accha", "theek hai", "bhai", "yaar", "inshallah", "shukriya", "nahi", "chalo"). ' +
  'Pick up and transcribe clear Hindi or Urdu segments faithfully without forcing nonsensical English homophones, and immediately return to English for English words. ' +
  '3. NOISE & HALLUCINATION GUARD: Never hallucinate unrelated scripts or languages from background noise, breathing, or unclear audio; default ambiguous phonetics to English or Japanese.';

function isDefaultOrLegacySystemInstruction(text) {
  const trimmed = String(text || '').trim();
  return !trimmed || trimmed === DEFAULT_SYSTEM_INSTRUCTION.trim() || trimmed === LEGACY_V311_SYSTEM_INSTRUCTION.trim();
}

const TRANSLATION_PROMPT_PRESETS = Object.freeze({
  hinglish:
    '【テーマ・ニュアンス: 英語雑談＋ヒンディー/ウルドゥー混在】英語ベースの会話・雑談の中に混じるヒンディー語やウルドゥー語の相槌・慣用表現・口語フレーズ（Hinglish / Roman Urdu 含む）のニュアンスや空気感も自然に汲み取り、会話の流れが違和感なく伝わるこなれた日本語に翻訳してください。',
  audit:
    '【テーマ・ニュアンス: 監査・法令厳密】規制要件、認証基準、不適合・是正措置、責任範囲のニュアンスを正確に翻訳してください。推測や過度な意訳は避け、専門用語や条約・規則の略称（HKC, EU-SRR, IHM, SRFP, SOC等）は原語または定訳を維持してください。',
  business:
    '【テーマ・ニュアンス: 会議・丁寧ビジネス】ビジネスミーティング・顧客折衝向けの自然で丁寧な敬語（です・ます調）に整えてください。発言の意図や結論が明確に伝わるよう、話の前後関係をなめらかに繋いで翻訳してください。',
  field:
    '【テーマ・ニュアンス: 現場・口語かみ砕き】現場作業員やヤード担当者のくだけた口語表現・言い直し・省略を自然にくみ取り、安全衛生や作業手順の状況が直感的に把握できる平易で分かりやすい日本語にしてください。',
  conference:
    '【テーマ・ニュアンス: 講演・パネル議論】国際会議・セミナー・パネルディスカッションの文脈として、登壇者の主張や背景説明の論理展開が伝わる、読みやすく洗練された解説調の日本語に翻訳してください。'
});

/** iPadOS / iOS 環境判定 */
function isIPadOrIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

let _intlDisplayJa = null;
let _intlDisplayEn = null;
try {
  if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
    _intlDisplayJa = new Intl.DisplayNames(['ja'], { type: 'language' });
    _intlDisplayEn = new Intl.DisplayNames(['en'], { type: 'language' });
  }
} catch (e) {}

/**
 * 任意のBCP-47 / ISO言語コードを正規化された短コードへ変換
 */
function normalizeLangCode(rawCode) {
  if (!rawCode) return '';
  const lower = String(rawCode).trim().toLowerCase().replace(/_/g, '-');
  if (!lower || lower === 'auto' || lower === 'und') return '';
  const primary = lower.split('-')[0];
  const aliasMap = {
    cmn: 'zh',
    yue: 'zh',
    zho: 'zh',
    chi: 'zh',
    fil: 'tl',
    tgl: 'tl',
    in: 'id',
    iw: 'he',
    ji: 'yi',
    jw: 'jv',
    nb: 'no',
    nn: 'no',
    jpn: 'ja',
    eng: 'en',
    hin: 'hi',
    urd: 'ur',
    ben: 'bn',
    kor: 'ko',
    vie: 'vi',
    ind: 'id',
    tha: 'th',
    mya: 'my',
    ara: 'ar',
    fas: 'fa',
    per: 'fa',
    tur: 'tr',
    spa: 'es',
    fra: 'fr',
    deu: 'de',
    por: 'pt',
    rus: 'ru',
    ita: 'it'
  };
  return aliasMap[primary] || primary;
}

/**
 * 静的レジストリ＋Intl.DisplayNamesによる85+全言語メタ情報解決
 */
function resolveLanguageMeta(langCode) {
  const norm = normalizeLangCode(langCode) || 'en';
  if (LANGUAGE_REGISTRY[norm]) return LANGUAGE_REGISTRY[norm];

  let jaName = norm.toUpperCase();
  let enName = norm.toUpperCase();
  try {
    if (_intlDisplayJa) {
      const resolvedJa = _intlDisplayJa.of(norm);
      if (resolvedJa && resolvedJa.toLowerCase() !== norm) jaName = resolvedJa;
    }
    if (_intlDisplayEn) {
      const resolvedEn = _intlDisplayEn.of(norm);
      if (resolvedEn && resolvedEn.toLowerCase() !== norm) enName = resolvedEn;
    }
  } catch (e) {}

  const rtlSet = new Set(['ur', 'ar', 'fa', 'he', 'ps', 'sd', 'ug', 'yi', 'ckb', 'dv']);
  return {
    code: norm,
    name: jaName,
    englishName: enName,
    badge: norm.toUpperCase().slice(0, 3),
    bcp47: [langCode && String(langCode).includes('-') ? String(langCode) : norm],
    speechLang: langCode && String(langCode).includes('-') ? String(langCode) : norm,
    rtl: rtlSet.has(norm)
  };
}

// 英語一般語彙や技術略語（MATLAB等）と衝突しない厳選Hinglish / Roman Urdu口語表現パターン
const COLLOQUIAL_HI_UR_REGEX = new RegExp(
  '\\b(' +
    'theek\\s+hai|thik\\s+hai|kya\\s+baat|kya\\s+haal|koi\\s+baat\\s+nahi|pata\\s+nahi|maloom\\s+nahi|' +
    'dekhte\\s+hain|karte\\s+hain|kar\\s+denge|kar\\s+lenge|ho\\s+gaya|ho\\s+jayega|kal\\s+subah|ek\\s+minute|' +
    'iska\\s+matlab|matlab\\s+yeh|thoda\\s+sa|' +
    'inshallah|inshaallah|mashallah|alhamdulillah|shukriya|meherbani|namaste|assalamu|walaikum|' +
    'accha|achha|bilkul|zaroor|shayad|lekin|kyunki|isliye|abhi|jaldi|chalo|dekho|suno|samjhe|samajh|' +
    'bhai|bhaiya|yaar|nahi|nahin' +
  ')\\b',
  'i'
);

// 日本語の新字体・常用漢字には存在しない中国語固有簡体字・語気助詞
const CHINESE_SIMPLIFIED_MARKERS_REGEX = /[这们么个还进话说请谢现开关门问间时动车机东两没吗呢吧們嗎這沒]/;

/**
 * 多言語＆コードスイッチング（英語＋ヒンディー語／ウルドゥー語混在含む）高精度判定
 * @param {string} text
 * @param {string|null} hintedLangCode
 * @param {string} recognitionProfile
 * @returns {{ primaryLang: string, mixedSubLangs: string[], colloquialMix: string|null, isRtl: boolean }}
 */
function detectLanguageInfo(text, hintedLangCode = null, recognitionProfile = 'ja-en-hi-ur') {
  const clean = String(text || '').trim();
  const hintLang = normalizeLangCode(hintedLangCode);

  if (!clean) {
    const fallback = hintLang || 'en';
    return {
      primaryLang: fallback,
      mixedSubLangs: [],
      colloquialMix: null,
      isRtl: resolveLanguageMeta(fallback).rtl
    };
  }

  const kanaCount = (clean.match(/[\u3040-\u309F\u30A0-\u30FF\uFF66-\uFF9F]/g) || []).length;
  const hanCount = (clean.match(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g) || []).length;
  const hangulCount = (clean.match(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g) || []).length;
  const devanagariCount = (clean.match(/[\u0900-\u097F]/g) || []).length;
  const bengaliCount = (clean.match(/[\u0980-\u09FF]/g) || []).length;
  const persoArabicCount = (clean.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g) || []).length;
  // ウルドゥー語固有文字（ٹ ڈ ڑ ں ہ ھ ے ۓ گ پ چ ژ ی ۔）
  const urduSpecificCount = (clean.match(/[\u0679\u0688\u0691\u06BA\u06C1\u06BE\u06D2\u06D3\u06AF\u067E\u0686\u0698\u06CC\u06D4]/g) || []).length;
  const strictlyUrduOnlyCount = (clean.match(/[\u0679\u0688\u0691\u06BA\u06BE\u06D2\u06D3\u06D4]/g) || []).length;
  const thaiCount = (clean.match(/[\u0E00-\u0E7F]/g) || []).length;
  const myanmarCount = (clean.match(/[\u1000-\u109F]/g) || []).length;
  const cyrillicCount = (clean.match(/[\u0400-\u04FF]/g) || []).length;
  const tamilCount = (clean.match(/[\u0B80-\u0BFF]/g) || []).length;
  const teluguCount = (clean.match(/[\u0C00-\u0C7F]/g) || []).length;
  const gujaratiCount = (clean.match(/[\u0A80-\u0AFF]/g) || []).length;
  const gurmukhiCount = (clean.match(/[\u0A00-\u0A7F]/g) || []).length;
  const malayalamCount = (clean.match(/[\u0D00-\u0D7F]/g) || []).length;
  const greekCount = (clean.match(/[\u0370-\u03FF]/g) || []).length;
  const hebrewCount = (clean.match(/[\u0590-\u05FF]/g) || []).length;

  const latinWords = clean.match(/[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]{2,}/g) || [];
  const latinCharCount = (clean.match(/[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/g) || []).length;

  // 1. かな文字が含まれれば最優先で日本語（英語略語混じりも日本語発話として保護）
  if (kanaCount > 0) {
    return { primaryLang: 'ja', mixedSubLangs: [], colloquialMix: null, isRtl: false };
  }

  // 2. 漢字のみ（かな無し）：日英優先プロファイルや日本語熟語を中国語と誤認しないよう保護
  if (hanCount > 0 && hangulCount === 0 && devanagariCount === 0 && persoArabicCount === 0) {
    if (hintLang === 'zh' || CHINESE_SIMPLIFIED_MARKERS_REGEX.test(clean)) {
      return { primaryLang: 'zh', mixedSubLangs: [], colloquialMix: null, isRtl: false };
    }
    if (
      recognitionProfile === 'multilingual-auto' &&
      hintLang !== 'ja' &&
      hanCount >= 5 &&
      /[的了在是不我你他她]/.test(clean)
    ) {
      return { primaryLang: 'zh', mixedSubLangs: [], colloquialMix: null, isRtl: false };
    }
    return { primaryLang: 'ja', mixedSubLangs: [], colloquialMix: null, isRtl: false };
  }

  // Perso-Arabic 文字域の言語特定（ウルドゥー語 vs アラビア語 vs ペルシア語）
  const resolvePersoArabicLang = () => {
    if (strictlyUrduOnlyCount > 0 || hintLang === 'ur') return 'ur';
    if (hintLang === 'ar' && urduSpecificCount === 0) return 'ar';
    if (hintLang === 'fa') return 'fa';
    if (urduSpecificCount > 0 || recognitionProfile === 'ja-en-hi-ur') return 'ur';
    return 'ar';
  };

  // 3. 英語＋南アジア諸語（ヒンディー語／ウルドゥー語／ベンガル語）の異種スクリプト混在（コードスイッチング）
  const southAsianScriptCount = devanagariCount + persoArabicCount + bengaliCount;
  if (southAsianScriptCount > 0) {
    const detectedSub = [];
    if (devanagariCount > 0) detectedSub.push('hi');
    if (persoArabicCount > 0) detectedSub.push(resolvePersoArabicLang());
    if (bengaliCount > 0) detectedSub.push('bn');

    // 英語単語が2語以上あり、ラテン文字量が一定比率以上なら「英語ベース＋雑談混在」と判定
    if (latinWords.length >= 2 && latinCharCount >= southAsianScriptCount * 0.55) {
      return {
        primaryLang: 'en',
        mixedSubLangs: detectedSub,
        colloquialMix: null,
        isRtl: false
      };
    }

    // 南アジアスクリプト主体の発話（英語単語が混じる場合も記録）
    let mainLang = detectedSub[0] || 'hi';
    if (persoArabicCount > devanagariCount && persoArabicCount >= bengaliCount) {
      mainLang = resolvePersoArabicLang();
    } else if (bengaliCount > devanagariCount && bengaliCount > persoArabicCount) {
      mainLang = 'bn';
    }
    const extraSub = detectedSub.filter((l) => l !== mainLang);
    if (latinWords.length >= 2) extraSub.push('en');
    return {
      primaryLang: mainLang,
      mixedSubLangs: extraSub,
      colloquialMix: null,
      isRtl: resolveLanguageMeta(mainLang).rtl
    };
  }

  // 4. その他の固有文字スクリプト判定
  if (hangulCount > 0) return { primaryLang: 'ko', mixedSubLangs: [], colloquialMix: null, isRtl: false };
  if (thaiCount > 0) return { primaryLang: 'th', mixedSubLangs: [], colloquialMix: null, isRtl: false };
  if (myanmarCount > 0) return { primaryLang: 'my', mixedSubLangs: [], colloquialMix: null, isRtl: false };
  if (cyrillicCount > 0) {
    const cyrLang = hintLang && ['uk', 'bg', 'sr', 'kk', 'MN', 'be'].includes(hintLang) ? hintLang : 'ru';
    return { primaryLang: cyrLang, mixedSubLangs: [], colloquialMix: null, isRtl: false };
  }
  if (tamilCount > 0) return { primaryLang: 'ta', mixedSubLangs: [], colloquialMix: null, isRtl: false };
  if (teluguCount > 0) return { primaryLang: 'te', mixedSubLangs: [], colloquialMix: null, isRtl: false };
  if (gujaratiCount > 0) return { primaryLang: 'gu', mixedSubLangs: [], colloquialMix: null, isRtl: false };
  if (gurmukhiCount > 0) return { primaryLang: 'pa', mixedSubLangs: [], colloquialMix: null, isRtl: false };
  if (malayalamCount > 0) return { primaryLang: 'ml', mixedSubLangs: [], colloquialMix: null, isRtl: false };
  if (greekCount > 0) return { primaryLang: 'el', mixedSubLangs: [], colloquialMix: null, isRtl: false };
  if (hebrewCount > 0) return { primaryLang: 'he', mixedSubLangs: [], colloquialMix: null, isRtl: true };

  // 5. ラテン文字系（英語・ローマ字Hinglish/Roman Urdu・ベトナム語・欧州/東南アジア諸言語）
  if (/[ăâđêôơưĂÂĐÊÔƠƯảẩẫậắằẳẵặẻểễệỉịỏổỗộởỡợủửữựỳỷỹỵ]/.test(clean)) {
    return { primaryLang: 'vi', mixedSubLangs: [], colloquialMix: null, isRtl: false };
  }

  // ローマ字表記のヒンディー語・ウルドゥー語（Hinglish / Roman Urdu）混在検出
  if (recognitionProfile !== 'strict-ja-en' && COLLOQUIAL_HI_UR_REGEX.test(clean)) {
    // エンジンが明確に hi / ur ヒントを返しており英語要素がほぼ無い場合を除き、英語ベース＋口語混在として扱う
    if ((hintLang === 'hi' || hintLang === 'ur') && latinWords.length <= 3) {
      return { primaryLang: hintLang, mixedSubLangs: [], colloquialMix: 'hi-ur', isRtl: false };
    }
    return { primaryLang: 'en', mixedSubLangs: [], colloquialMix: 'hi-ur', isRtl: false };
  }

  if (/[ğĞşŞıİ]/.test(clean) && (hintLang === 'tr' || recognitionProfile === 'multilingual-auto')) {
    return { primaryLang: 'tr', mixedSubLangs: [], colloquialMix: null, isRtl: false };
  }

  // Gemini Live や Web Speech から信頼できるラテン系他言語ヒントが付与された場合（日英厳密ロック時を除く）
  if (
    hintLang &&
    hintLang !== 'en' &&
    hintLang !== 'ja' &&
    recognitionProfile !== 'strict-ja-en' &&
    recognitionProfile !== 'ja-en-hi-ur'
  ) {
    // 非ラテン文字言語コード（ko, zh, hi, ur, ar, ru等）がラテン文字英語に誤付与された場合は英語優先で保護
    const nonLatinCodes = new Set(['ja', 'zh', 'ko', 'hi', 'ur', 'bn', 'ar', 'fa', 'th', 'my', 'ru', 'uk', 'el', 'he', 'ta', 'te', 'gu', 'pa', 'ml']);
    if (!nonLatinCodes.has(hintLang)) {
      return { primaryLang: hintLang, mixedSubLangs: [], colloquialMix: null, isRtl: resolveLanguageMeta(hintLang).rtl };
    }
  }

  return { primaryLang: 'en', mixedSubLangs: [], colloquialMix: null, isRtl: false };
}

function detectLanguage(text, hintedLangCode = null, recognitionProfile = 'ja-en-hi-ur') {
  return detectLanguageInfo(text, hintedLangCode, recognitionProfile).primaryLang;
}

// 旧関数名の後方互換維持
function detectLanguage4(text, hintedLangCode = null) {
  return detectLanguage(text, hintedLangCode);
}

/**
 * 翻訳ルーティング解決（LongFormUtteranceBuffer と TranslationService で共通利用）
 */
function resolveTranslationRoute(text, direction = 'auto', partnerLang = 'en', hintedLangCode = null, recognitionProfile = 'ja-en-hi-ur') {
  const effectivePartner = normalizeLangCode(partnerLang) || 'en';
  const effectiveProfile = direction === 'en-to-ja' ? 'strict-ja-en' : recognitionProfile;
  const langInfo = detectLanguageInfo(text, hintedLangCode, effectiveProfile);
  const hasCodeSwitch = (langInfo.mixedSubLangs && langInfo.mixedSubLangs.length > 0) || Boolean(langInfo.colloquialMix);

  if (direction === 'en-to-ja') {
    return { srcLang: 'en', targetLang: 'ja', langInfo: { ...langInfo, primaryLang: 'en' }, skipTranslation: false };
  }
  if (direction === 'ja-to-partner' || direction === 'ja-to-en') {
    const target = direction === 'ja-to-en' ? 'en' : effectivePartner;
    return { srcLang: 'ja', targetLang: target, langInfo: { ...langInfo, primaryLang: 'ja' }, skipTranslation: target === 'ja' };
  }
  if (direction === 'bn-to-ja' || direction === 'hi-to-ja' || direction === 'ur-to-ja') {
    const fixedSrc = direction.split('-')[0];
    return { srcLang: fixedSrc, targetLang: 'ja', langInfo, skipTranslation: false };
  }
  if (direction === 'all-to-ja') {
    const src = langInfo.primaryLang;
    return {
      srcLang: src,
      targetLang: 'ja',
      langInfo,
      skipTranslation: src === 'ja' && !hasCodeSwitch
    };
  }
  if (direction === 'all-to-partner') {
    const src = langInfo.primaryLang;
    return {
      srcLang: src,
      targetLang: effectivePartner,
      langInfo,
      skipTranslation: src === effectivePartner && !hasCodeSwitch
    };
  }

  // 'auto': 日本語発話 ➔ 相手言語 (既定: 英語) / その他すべての外国語・混在発話 ➔ 日本語
  if (langInfo.primaryLang === 'ja') {
    return {
      srcLang: 'ja',
      targetLang: effectivePartner,
      langInfo,
      skipTranslation: effectivePartner === 'ja'
    };
  }
  return {
    srcLang: langInfo.primaryLang,
    targetLang: 'ja',
    langInfo,
    skipTranslation: false
  };
}

function getLanguageDisplayName(langCode, mixedSubLangs = [], colloquialMix = null) {
  const baseName = resolveLanguageMeta(langCode).name;
  if (Array.isArray(mixedSubLangs) && mixedSubLangs.length > 0) {
    const subNames = mixedSubLangs.map((c) => resolveLanguageMeta(c).name).join('・');
    return `${baseName} (${subNames}混在)`;
  }
  if (colloquialMix === 'hi-ur') {
    return `${baseName} (ヒンディー/ウルドゥー口語混在)`;
  }
  return baseName;
}

function getLanguageBadge(langCode, mixedSubLangs = [], colloquialMix = null) {
  const baseBadge = resolveLanguageMeta(langCode).badge || '🌐';
  if (Array.isArray(mixedSubLangs) && mixedSubLangs.length > 0) {
    const firstSubBadge = resolveLanguageMeta(mixedSubLangs[0]).badge;
    return `${baseBadge}·${firstSubBadge}`;
  }
  if (colloquialMix === 'hi-ur') {
    return `${baseBadge}+`;
  }
  return baseBadge;
}

function formatDocLanguageLabel(langCode, mixedSubLangs = [], colloquialMix = null) {
  const base = (normalizeLangCode(langCode) || 'auto').toUpperCase();
  if (Array.isArray(mixedSubLangs) && mixedSubLangs.length > 0) {
    const subs = mixedSubLangs.map((c) => (normalizeLangCode(c) || c).toUpperCase()).join('+');
    return `${base}+${subs}`;
  }
  if (colloquialMix === 'hi-ur') {
    return `${base}+HI/UR`;
  }
  return base;
}

function getSpeakerShortLabel(speaker) {
  if (!speaker) return '発話';
  if (ROLE_SHORT_LABELS[speaker]) return ROLE_SHORT_LABELS[speaker];
  if (speaker.includes('Yard')) return 'Yard';
  if (speaker.includes('Auditor')) return 'Auditor';
  if (speaker.includes('Facility')) return 'Facility';
  if (speaker.includes('Other')) return 'Other';
  return speaker;
}

function getEngineShortLabel(engine) {
  if (!engine) return 'Live';
  if (engine.includes('Gemini')) return 'Live';
  if (engine.includes('Web')) return 'Web';
  return engine;
}

function encodeBase64Utf8(str) {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16)))
  );
}

function decodeBase64Utf8(b64) {
  const binary = atob(b64);
  const percentEncoded = Array.prototype.map
    .call(binary, (c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
    .join('');
  return decodeURIComponent(percentEncoded);
}

function encodeBase64UrlUtf8(str) {
  return encodeBase64Utf8(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64UrlUtf8(b64url) {
  let b64 = String(b64url || '').replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  return decodeBase64Utf8(b64);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 経過ミリ秒を MM:SS または H:MM:SS 形式に整形する
 */
function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * RFC 4180 準拠の CSV フィールドエスケープ
 */
function escapeCsvField(val) {
  const str = val === null || val === undefined ? '' : String(val);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Excel互換（UTF-8 BOM + CRLF）のタイムラインCSVを生成する
 */
function buildTranscriptCsv(records = []) {
  const header = ['時刻', '話者', '言語', '原文', '訳文', '認識エンジン'].map(escapeCsvField).join(',');
  const rows = [header];
  for (const r of records) {
    const langLabel = getLanguageDisplayName(r.speakerLang, r.mixedSubLangs, r.colloquialMix);
    rows.push([
      r.time || '',
      r.speaker || '',
      langLabel,
      r.originalText || '',
      r.translatedText || '',
      r.engine || ''
    ].map(escapeCsvField).join(','));
  }
  return '\uFEFF' + rows.join('\r\n') + '\r\n';
}

/**
 * サマリー込みの Markdown 議事録を生成する
 */
function buildTranscriptMarkdown(records = [], { category = 'Common', title = '', latestSummary = null } = {}) {
  const cleanCell = (s) => String(s || '').replace(/\r?\n/g, '<br>').replace(/\|/g, '\\|');
  const docHeading = title ? `# ${title}\n\n` : `# 会話・翻訳議事録 (${category})\n\n`;
  const exportedAt = new Date().toLocaleString('ja-JP');
  let md = docHeading;
  md += `- **出力日時**: ${exportedAt}\n`;
  md += `- **分野**: ${category}\n`;
  md += `- **発話件数**: ${records.length}件\n\n`;

  if (latestSummary && latestSummary.markdown) {
    const metaParts = [latestSummary.rangeLabel, latestSummary.timeSpan].filter(Boolean).join(' / ');
    md += `## 会話サマリー${metaParts ? ` (${metaParts})` : ''}\n\n`;
    md += `${String(latestSummary.markdown).trim()}\n\n---\n\n`;
  }

  md += '## 確定翻訳タイムライン\n\n';
  md += '| 時刻 | 話者 | 言語 | 原文 | 訳文 |\n|---|---|---|---|---|\n';
  for (const t of records) {
    const langLabel = getLanguageDisplayName(t.speakerLang, t.mixedSubLangs, t.colloquialMix);
    md += `| ${cleanCell(t.time)} | ${cleanCell(t.speaker)} | ${cleanCell(langLabel)} | ${cleanCell(t.originalText)} | ${cleanCell(t.translatedText)} |\n`;
  }
  return md;
}

/**
 * シンプルな時系列プレーンテキスト議事録を生成する
 */
function buildTranscriptTxt(records = [], { category = 'Common', title = '', latestSummary = null } = {}) {
  const lines = [];
  lines.push(title || `会話・翻訳議事録 (${category})`);
  lines.push(`出力日時: ${new Date().toLocaleString('ja-JP')} / 発話件数: ${records.length}件`);
  lines.push('==================================================');

  if (latestSummary && latestSummary.markdown) {
    const metaParts = [latestSummary.rangeLabel, latestSummary.timeSpan].filter(Boolean).join(' / ');
    lines.push('');
    lines.push(`【会話サマリー${metaParts ? ` (${metaParts})` : ''}】`);
    lines.push(String(latestSummary.markdown).trim());
    lines.push('');
    lines.push('--------------------------------------------------');
  }

  for (const r of records) {
    const langLabel = getLanguageDisplayName(r.speakerLang, r.mixedSubLangs, r.colloquialMix);
    lines.push('');
    lines.push(`[${r.time || '--:--:--'}] ${r.speaker || ''} (${langLabel})`);
    lines.push(`原文: ${r.originalText || ''}`);
    lines.push(`訳文: ${r.translatedText || ''}`);
  }
  lines.push('');
  return lines.join('\r\n');
}

/**
 * タイムラインのキーワード検索・話者/言語フィルタ判定
 */
function matchesTimelineFilter(record, query = '', filter = 'all') {
  if (!record) return false;
  const f = String(filter || 'all');
  const spk = String(record.speaker || '');
  const lang = String(record.speakerLang || 'en');
  const isMixed = (Array.isArray(record.mixedSubLangs) && record.mixedSubLangs.length > 0) || Boolean(record.colloquialMix);

  if (f === 'auditor' && !spk.includes('Auditor')) return false;
  if (f === 'yard' && !spk.includes('Yard')) return false;
  if (f === 'facility' && !spk.includes('Facility')) return false;
  if (f === 'other' && !spk.includes('Other')) return false;
  if (f === 'ja' && lang !== 'ja') return false;
  if (f === 'foreign' && lang === 'ja') return false;
  if (f === 'mixed' && !isMixed) return false;

  const trimmedQuery = String(query || '').trim().toLowerCase();
  if (!trimmedQuery) return true;

  const haystack = `${record.originalText || ''}\n${record.translatedText || ''}\n${spk}`.toLowerCase();
  const tokens = trimmedQuery.split(/\s+/).filter(Boolean);
  return tokens.every((tok) => haystack.includes(tok));
}

/**
 * セッション下書き保存用オブジェクトを構築する
 */
function serializeSessionDraft({ records = [], summaryHistory = [], category = 'Common', savedAt = Date.now() } = {}) {
  const safeRecords = records.slice(-500).map((r) => ({
    id: r.id,
    time: r.time || '',
    createdAt: r.createdAt || savedAt,
    speaker: r.speaker || ROLES[0],
    speakerLang: r.speakerLang || 'en',
    mixedSubLangs: Array.isArray(r.mixedSubLangs) ? r.mixedSubLangs : [],
    colloquialMix: r.colloquialMix || null,
    hintedLangCode: r.hintedLangCode || null,
    originalText: r.originalText || '',
    translatedText: r.translatedText || '',
    engine: r.engine || 'Gemini Live',
    direction: r.direction || 'auto',
    partnerLang: r.partnerLang || 'en',
    recognitionProfile: r.recognitionProfile || DEFAULT_SETTINGS.DEFAULT_RECOGNITION_PROFILE,
    category: r.category || category,
    isTranslating: false
  }));

  const safeSummaries = (summaryHistory || []).slice(0, 10).map((s) => ({
    id: s.id,
    generatedAt: s.generatedAt || '',
    rangeLabel: s.rangeLabel || '',
    timeSpan: s.timeSpan || '',
    count: s.count || 0,
    hasPending: false,
    markdown: s.markdown || '',
    model: s.model || ''
  }));

  return {
    version: APP_VERSION,
    savedAt,
    category,
    records: safeRecords,
    summaryHistory: safeSummaries
  };
}

/**
 * 前回の未保存セッション下書きを現在のセッション先頭（時系列順）へマージする
 */
function mergeRestoredDraft(prevDraft, currentRecords = [], currentSummaries = []) {
  const prevRecs = Array.isArray(prevDraft?.records) ? prevDraft.records : [];
  const seenIds = new Set();
  const mergedRecords = [];

  for (const r of prevRecs) {
    if (!r || !r.id || seenIds.has(r.id)) continue;
    seenIds.add(r.id);
    mergedRecords.push({
      ...r,
      isTranslating: false
    });
  }
  for (const r of currentRecords) {
    if (!r || !r.id || seenIds.has(r.id)) continue;
    seenIds.add(r.id);
    mergedRecords.push(r);
  }

  const prevSums = Array.isArray(prevDraft?.summaryHistory) ? prevDraft.summaryHistory : [];
  const seenSumIds = new Set();
  const mergedSummaries = [];
  for (const s of [...currentSummaries, ...prevSums]) {
    if (!s || !s.id || seenSumIds.has(s.id)) continue;
    seenSumIds.add(s.id);
    mergedSummaries.push(s);
  }

  return { records: mergedRecords, summaryHistory: mergedSummaries };
}

// ==========================================
// 2. Config Manager (localStorage)
// ==========================================
class ConfigManager {
  static STORAGE_KEYS = Object.freeze({
    API_KEY: 'glt_gemini_api_key',
    GAS_URL: 'glt_gas_web_app_url',
    GAS_TOKEN: 'glt_gas_token',
    RECOGNITION_PROFILE: 'glt_recognition_profile',
    DIRECTION: 'glt_translation_direction',
    PARTNER_LANG: 'glt_partner_lang',
    CUSTOM_LANGS: 'glt_custom_langs',
    CATEGORY: 'glt_category',
    AUTO_SAVE: 'glt_auto_save_enabled',
    DOC_MODE: 'glt_doc_mode',
    FOLDER_ID: 'glt_output_folder_id',
    GAIN: 'glt_mic_gain',
    LAST_DOC_ID: 'glt_last_doc_id',
    ENGINE_MODE: 'glt_engine_mode',
    LIVE_MODEL: 'glt_live_model',
    AUDIO_SOURCE: 'glt_audio_source',
    SYSTEM_INSTRUCTION: 'glt_system_instruction',
    CHUNK_MODE: 'glt_chunk_mode',
    TRANSLATION_CUSTOM_PROMPT: 'glt_translation_custom_prompt',
    TRANSLATION_PROMPT_OPEN: 'glt_translation_prompt_open',
    CONTEXT_WINDOW: 'glt_context_window',
    SUMMARY_RANGE: 'glt_summary_range',
    SUMMARY_CUSTOM_MIN: 'glt_summary_custom_min',
    VAD_MODE: 'glt_vad_mode',
    ADVANCED_OPEN: 'glt_advanced_open',
    MIC_DEVICE_ID: 'glt_mic_device_id',
    FONT_SIZE: 'glt_font_size',
    THEME: 'glt_theme',
    INCLUDE_SUMMARY_IN_DOC: 'glt_include_summary_in_doc',
    SESSION_DRAFT: 'glt_session_draft',
    SESSION_DRAFT_PREV: 'glt_session_draft_prev'
  });

  static get(key, defaultValue = '') {
    try {
      const val = localStorage.getItem(key);
      return val !== null ? val : defaultValue;
    } catch (e) {
      console.warn('LocalStorage access failed:', e);
      return defaultValue;
    }
  }

  static set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('LocalStorage write failed:', e);
    }
  }

  static remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn('LocalStorage remove failed:', e);
    }
  }
}

// ==========================================
// 2.5. Voice Activity Detector (Pre-roll + Hangover + Adaptive Noise Floor)
// ==========================================
class VoiceActivityDetector {
  // Pre-Gain（gainNode前段の生信号）基準のプリセット
  static PRESETS = Object.freeze({
    auto: {
      label: '自動 (標準)',
      preRollMs: 450,
      hangoverMs: 1800,
      minRms: 0.006,
      onsetMult: 2.2,
      sustainMult: 1.45,
      onsetFrames: 1,
      minVoiceRatio: 0.25,
      maxNoiseFloor: 0.12
    },
    sensitive: {
      label: '敏感 (小声・遠距離)',
      preRollMs: 550,
      hangoverMs: 2200,
      minRms: 0.003,
      onsetMult: 1.7,
      sustainMult: 1.25,
      onsetFrames: 1,
      minVoiceRatio: 0.15,
      maxNoiseFloor: 0.08
    },
    strong: {
      label: '強め (騒音現場向け)',
      preRollMs: 400,
      hangoverMs: 1400,
      minRms: 0.012,
      onsetMult: 2.8,
      sustainMult: 1.70,
      onsetFrames: 2,
      minVoiceRatio: 0.38,
      maxNoiseFloor: 0.18
    },
    off: {
      label: 'OFF (常時送信)',
      preRollMs: 0,
      hangoverMs: 0
    }
  });

  constructor(mode = 'auto') {
    this.mode = VoiceActivityDetector.PRESETS[mode] ? mode : 'auto';
    this.reset(true);
  }

  setMode(mode) {
    if (!VoiceActivityDetector.PRESETS[mode]) return;
    const prevMode = this.mode;
    this.mode = mode;
    if (prevMode !== mode) {
      this.preRollQueue = [];
      this.onsetStreak = 0;
      this.silenceElapsedMs = 0;
      this._rmsWindow = [];
      if (mode === 'off') {
        this.isSpeaking = true;
      } else if (prevMode === 'off') {
        this.isSpeaking = false;
      }
    }
  }

  reset(resetStats = false) {
    this.isSpeaking = this.mode === 'off';
    this.onsetStreak = 0;
    this.silenceElapsedMs = 0;
    this.preRollQueue = [];
    this.noiseFloor = 0.004;
    this._noiseInitialized = false;
    this._rmsWindow = [];
    if (resetStats) {
      this.totalFrames = 0;
      this.transmittedFrames = 0;
    }
  }

  getSavedPercent() {
    if (this.mode === 'off' || this.totalFrames < 10) return 0;
    const ratio = 1 - (this.transmittedFrames / this.totalFrames);
    return Math.max(0, Math.min(99, Math.round(ratio * 100)));
  }

  /**
   * 1音声フレームを評価し、送信すべきPCMチャンク群と状態遷移を返却
   * Minimum Statistics 方式により、高騒音環境でも発話張り付きを構造的に防止
   * @param {{ rms: number, voiceRatio: number|null, chunkDurationMs: number, base64Chunk: string }} frame
   */
  processFrame({ rms, voiceRatio, chunkDurationMs, base64Chunk }) {
    this.totalFrames += 1;

    if (this.mode === 'off') {
      this.transmittedFrames += 1;
      this.isSpeaking = true;
      return {
        chunksToSend: base64Chunk ? [base64Chunk] : [],
        streamEnded: false,
        isSpeaking: true,
        state: 'off',
        savedPct: 0,
        noiseFloor: this.noiseFloor
      };
    }

    const cfg = VoiceActivityDetector.PRESETS[this.mode] || VoiceActivityDetector.PRESETS.auto;
    const frameMs = Math.max(10, chunkDurationMs || 42.67);
    const maxPreRollFrames = Math.max(2, Math.ceil(cfg.preRollMs / frameMs));
    const minWindowFrames = Math.max(20, Math.ceil(2800 / frameMs)); // 約2.8秒の最小値追跡窓

    if (!this._noiseInitialized) {
      this.noiseFloor = Math.min(cfg.maxNoiseFloor, Math.max(0.0015, rms));
      this._noiseInitialized = true;
    }

    // スライディングウィンドウで直近約2.8秒の最小RMSを追跡（定常騒音のみ上向きに検出）
    this._rmsWindow.push(rms);
    while (this._rmsWindow.length > minWindowFrames) {
      this._rmsWindow.shift();
    }

    if (this._rmsWindow.length >= minWindowFrames) {
      let windowMin = this._rmsWindow[0];
      for (let i = 1; i < this._rmsWindow.length; i++) {
        if (this._rmsWindow[i] < windowMin) windowMin = this._rmsWindow[i];
      }
      // 2.8秒間一度も下がらなかった底値（定常騒音）に合わせてノイズフロアを適応
      if (windowMin > this.noiseFloor * 1.1) {
        this.noiseFloor = Math.min(cfg.maxNoiseFloor, this.noiseFloor * 0.85 + windowMin * 0.15);
      } else if (windowMin < this.noiseFloor) {
        this.noiseFloor = Math.max(0.0015, this.noiseFloor * 0.90 + windowMin * 0.10);
      }
    }

    const onsetThreshold = Math.max(cfg.minRms, this.noiseFloor * cfg.onsetMult);
    const sustainThreshold = Math.max(cfg.minRms * 0.65, this.noiseFloor * cfg.sustainMult);

    const voiceBandOk =
      voiceRatio === null ||
      voiceRatio >= cfg.minVoiceRatio ||
      rms >= onsetThreshold * 2.2;

    let chunksToSend = [];
    let streamEnded = false;

    if (!this.isSpeaking) {
      if (rms >= onsetThreshold && voiceBandOk) {
        this.onsetStreak += 1;
        if (this.onsetStreak >= cfg.onsetFrames) {
          this.isSpeaking = true;
          this.silenceElapsedMs = 0;
          this.onsetStreak = 0;
          if (this.preRollQueue.length > 0) {
            chunksToSend = this.preRollQueue.slice();
            this.preRollQueue = [];
          }
          if (base64Chunk) chunksToSend.push(base64Chunk);
          this.transmittedFrames += chunksToSend.length;
        } else if (base64Chunk) {
          this.preRollQueue.push(base64Chunk);
          while (this.preRollQueue.length > maxPreRollFrames) {
            this.preRollQueue.shift();
          }
        }
      } else {
        this.onsetStreak = 0;
        if (base64Chunk) {
          this.preRollQueue.push(base64Chunk);
          while (this.preRollQueue.length > maxPreRollFrames) {
            this.preRollQueue.shift();
          }
        }
        // 非発話区間での迅速なノイズフロア適応
        if (rms < this.noiseFloor) {
          this.noiseFloor = Math.max(0.0015, this.noiseFloor * 0.88 + rms * 0.12);
        } else if (rms < onsetThreshold) {
          this.noiseFloor = Math.min(cfg.maxNoiseFloor, this.noiseFloor * 0.96 + rms * 0.04);
        }
      }
    } else {
      if (base64Chunk) {
        chunksToSend = [base64Chunk];
        this.transmittedFrames += 1;
      }

      if (rms >= sustainThreshold && voiceBandOk) {
        this.silenceElapsedMs = 0;
      } else {
        this.silenceElapsedMs += frameMs;
        if (rms < this.noiseFloor) {
          this.noiseFloor = Math.max(0.0015, this.noiseFloor * 0.95 + rms * 0.05);
        }
        if (this.silenceElapsedMs >= cfg.hangoverMs) {
          this.isSpeaking = false;
          this.silenceElapsedMs = 0;
          this.onsetStreak = 0;
          streamEnded = true;
        }
      }
    }

    return {
      chunksToSend,
      streamEnded,
      isSpeaking: this.isSpeaking,
      state: this.isSpeaking ? 'speaking' : 'silent',
      savedPct: this.getSavedPercent(),
      noiseFloor: this.noiseFloor
    };
  }
}

// ==========================================
// 3. Audio Capture Service (Anti-Aliased 16kHz PCM - iPad/iOS Optimized)
// ==========================================
class AudioCaptureService {
  constructor() {
    this.audioContext = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.highpassNode = null;
    this.gainNode = null;
    this.compressorNode = null;
    this.filterNode = null;
    this.analyserNode = null;
    this.vadAnalyserNode = null;
    this.processorNode = null;
    this.isRecording = false;
    this.isPaused = false;
    this.gainValue = 2.5;
    this.deviceId = '';
    this.vad = new VoiceActivityDetector('auto');
    this.onChunkCallback = null;
    this.onVolumeCallback = null;
    this.onStreamEndCallback = null;
    this.onVadStateCallback = null;
    this._cachedBuffer = null;
    this._freqData = null;
    this._vadTimeFloat = null;
    this._vadTimeByte = null;
    this._lastVadUiState = null;
    this._lastVadUiUpdateAt = 0;
  }

  setDeviceId(deviceId) {
    this.deviceId = String(deviceId || '').trim();
  }

  setVadMode(mode) {
    this.vad.setMode(mode);
    this._lastVadUiState = null;
    if (this.onVadStateCallback) {
      this.onVadStateCallback({
        state: mode === 'off' ? 'off' : (this.vad.isSpeaking ? 'speaking' : 'silent'),
        isSpeaking: this.vad.isSpeaking,
        savedPct: this.vad.getSavedPercent()
      });
    }
  }

  setGain(val) {
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      this.gainValue = num;
      if (this.gainNode && this.audioContext && this.audioContext.state !== 'closed') {
        try {
          this.gainNode.gain.setTargetAtTime(this.gainValue, this.audioContext.currentTime, 0.05);
        } catch (e) {
          this.gainNode.gain.value = this.gainValue;
        }
      }
    }
  }

  unlockContext() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioContextClass();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }
      const buffer = this.audioContext.createBuffer(1, 1, 22050);
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext.destination);
      source.start(0);
      return this.audioContext;
    } catch (e) {
      console.warn('[AudioCapture] unlockContext failed:', e);
      return null;
    }
  }

  ensureContext() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('お使いのブラウザは Web Audio API に対応していません。');
      }
      this.audioContext = new AudioContextClass();
    }
    if (this.audioContext.state === 'suspended') {
      return this.audioContext.resume();
    }
    return Promise.resolve();
  }

  async _acquireMediaStream(sourceType, onEnded) {
    const isIOS = isIPadOrIOS();

    if (sourceType === 'display') {
      if (isIOS) {
        throw new Error('iPad / iPhone ではOSの仕様によりタブ音声キャプチャはサポートされていません。「マイク (対面会話)」をご利用ください。');
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error('お使いのブラウザはタブ・PC音声のキャプチャに対応していません。Chrome または Edge をご利用ください。');
      }

      let displayStream;
      try {
        displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          throw new Error('画面・音声共有がキャンセルされました。');
        }
        throw new Error(`PC音声の共有に失敗しました: ${err.message}`);
      }

      const audioTracks = displayStream.getAudioTracks();
      if (audioTracks.length === 0) {
        displayStream.getTracks().forEach((t) => t.stop());
        throw new Error('音声が共有されていません。共有ウィンドウで「タブの音声も共有」または「音声を共有」にチェックを入れてください。');
      }

      displayStream.getVideoTracks().forEach((t) => t.stop());
      if (onEnded) {
        audioTracks[0].onended = () => onEnded();
      }
      return new MediaStream([audioTracks[0]]);
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('マイクアクセスAPIが利用できません。HTTPS または http://localhost 上でアクセスしてください。');
    }

    const constraintCandidates = [];
    if (this.deviceId) {
      constraintCandidates.push(
        { audio: { deviceId: { exact: this.deviceId }, echoCancellation: true, noiseSuppression: !isIOS, autoGainControl: true } },
        { audio: { deviceId: { exact: this.deviceId }, echoCancellation: true } },
        { audio: { deviceId: { exact: this.deviceId } } }
      );
    }
    constraintCandidates.push(
      { audio: { echoCancellation: true, noiseSuppression: !isIOS, autoGainControl: true } },
      { audio: { echoCancellation: true } },
      { audio: true }
    );

    let lastError = null;
    for (const constraints of constraintCandidates) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (stream) return stream;
      } catch (err) {
        lastError = err;
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          throw new Error('マイクへのアクセスが拒否されました。iPad/ブラウザの設定からマイク使用を許可してください。');
        }
        console.warn('[AudioCapture] getUserMedia fallback:', constraints, err);
      }
    }

    throw new Error(`マイクの取得に失敗しました: ${lastError ? lastError.message : '利用可能なマイクが見つかりませんでした'}`);
  }

  async start(onChunk, onVolume, sourceType = 'mic', onEnded = null, vadHooks = {}) {
    if (this.isRecording) return;
    this.onChunkCallback = onChunk;
    this.onVolumeCallback = onVolume;
    this.onStreamEndCallback = vadHooks.onStreamEnd || null;
    this.onVadStateCallback = vadHooks.onVadState || null;
    this.vad.reset(true);
    this._lastVadUiState = null;
    this._lastVadUiUpdateAt = 0;

    this.unlockContext();
    await this.ensureContext();

    this.mediaStream = await this._acquireMediaStream(sourceType, onEnded);
    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

    // 1. 80Hz Highpass Filter (低周波ノイズ除去)
    this.highpassNode = this.audioContext.createBiquadFilter();
    this.highpassNode.type = 'highpass';
    this.highpassNode.frequency.value = 80;
    this.highpassNode.Q.value = 0.7;

    // 2. Pre-amp Gain Booster (遠距離集音)
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = this.gainValue;

    // 3. Dynamics Compressor (音割れ防止)
    this.compressorNode = this.audioContext.createDynamicsCompressor();
    this.compressorNode.threshold.value = -32;
    this.compressorNode.knee.value = 24;
    this.compressorNode.ratio.value = 8;
    this.compressorNode.attack.value = 0.003;
    this.compressorNode.release.value = 0.20;

    // 4. 7.5kHz Lowpass Anti-Aliasing Filter
    this.filterNode = this.audioContext.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = 7500;

    this.sourceNode.connect(this.highpassNode);
    this.highpassNode.connect(this.gainNode);
    this.gainNode.connect(this.compressorNode);
    this.compressorNode.connect(this.filterNode);

    // ゲイン・コンプレッサー前段（highpass直後）からVAD専用アナライザーを分岐
    // → マイク感度 (1.0x〜3.5x) を変更してもVAD判定が一切ブレない
    this.vadAnalyserNode = this.audioContext.createAnalyser();
    this.vadAnalyserNode.fftSize = 2048;
    this.vadAnalyserNode.smoothingTimeConstant = 0.2;
    this.highpassNode.connect(this.vadAnalyserNode);

    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.filterNode.connect(this.analyserNode);

    this.processorNode = this.audioContext.createScriptProcessor(2048, 1, 1);

    // WebKit (iOS/iPadOS) のGCによるオーディオノード切断防止
    if (typeof window !== 'undefined') {
      window._activeAudioSession = {
        context: this.audioContext,
        source: this.sourceNode,
        highpass: this.highpassNode,
        gain: this.gainNode,
        compressor: this.compressorNode,
        filter: this.filterNode,
        analyser: this.analyserNode,
        vadAnalyser: this.vadAnalyserNode,
        processor: this.processorNode,
        stream: this.mediaStream
      };
    }

    const inputSampleRate = this.audioContext.sampleRate;
    const targetSampleRate = 16000;
    const chunkDurationMs = (2048 / inputSampleRate) * 1000;

    const vadFftSize = this.vadAnalyserNode.fftSize;
    const freqBinCount = this.vadAnalyserNode.frequencyBinCount;
    this._freqData = new Uint8Array(freqBinCount);
    this._vadTimeFloat = typeof this.vadAnalyserNode.getFloatTimeDomainData === 'function'
      ? new Float32Array(vadFftSize)
      : null;
    this._vadTimeByte = this._vadTimeFloat ? null : new Uint8Array(vadFftSize);

    const binHz = inputSampleRate / vadFftSize;
    const voiceStartBin = Math.max(1, Math.floor(200 / binHz));
    const voiceEndBin = Math.min(freqBinCount - 1, Math.ceil(3600 / binHz));

    this.processorNode.onaudioprocess = (e) => {
      e.outputBuffer.getChannelData(0).fill(0);
      if (!this.isRecording || this.isPaused) return;

      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      const inputBuffer = e.inputBuffer.getChannelData(0);
      let meterSumSq = 0;
      for (let i = 0; i < inputBuffer.length; i++) {
        meterSumSq += inputBuffer[i] * inputBuffer[i];
      }
      const meterRms = Math.sqrt(meterSumSq / inputBuffer.length);

      // VAD判定用RMSは Pre-Gain（gainNode前段）から算出
      let vadRms = meterRms / Math.max(1.0, this.gainValue);
      let voiceRatio = null;

      if (this.vad.mode !== 'off' && this.vadAnalyserNode) {
        if (this._vadTimeFloat) {
          this.vadAnalyserNode.getFloatTimeDomainData(this._vadTimeFloat);
          let vSumSq = 0;
          for (let i = 0; i < vadFftSize; i++) {
            const s = this._vadTimeFloat[i];
            vSumSq += s * s;
          }
          vadRms = Math.sqrt(vSumSq / vadFftSize);
        } else if (this._vadTimeByte) {
          this.vadAnalyserNode.getByteTimeDomainData(this._vadTimeByte);
          let vSumSq = 0;
          for (let i = 0; i < vadFftSize; i++) {
            const s = (this._vadTimeByte[i] - 128) / 128;
            vSumSq += s * s;
          }
          vadRms = Math.sqrt(vSumSq / vadFftSize);
        }

        if (this._freqData) {
          this.vadAnalyserNode.getByteFrequencyData(this._freqData);
          let voiceSum = 0;
          let totalSum = 0;
          for (let b = 1; b < freqBinCount; b++) {
            const v = this._freqData[b];
            totalSum += v;
            if (b >= voiceStartBin && b <= voiceEndBin) voiceSum += v;
          }
          voiceRatio = totalSum > 20 ? (voiceSum / totalSum) : 0.5;
        }
      }

      const downsampled = this._downsampleBuffer(inputBuffer, inputSampleRate, targetSampleRate);
      const base64Chunk = this._int16ToBase64(downsampled);

      const vadRes = this.vad.processFrame({ rms: vadRms, voiceRatio, chunkDurationMs, base64Chunk });

      if (this.onVolumeCallback) {
        this.onVolumeCallback(meterRms, vadRes.isSpeaking);
      }

      if (this.onChunkCallback && vadRes.chunksToSend.length > 0) {
        for (let i = 0; i < vadRes.chunksToSend.length; i++) {
          this.onChunkCallback(vadRes.chunksToSend[i]);
        }
      }

      if (vadRes.streamEnded && this.onStreamEndCallback) {
        this.onStreamEndCallback();
      }

      if (this.onVadStateCallback) {
        const now = Date.now();
        if (vadRes.state !== this._lastVadUiState || (now - this._lastVadUiUpdateAt) >= 1000) {
          this._lastVadUiState = vadRes.state;
          this._lastVadUiUpdateAt = now;
          this.onVadStateCallback(vadRes);
        }
      }
    };

    this.filterNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);

    this.isRecording = true;
    this.isPaused = false;
  }

  pause() {
    this.isPaused = true;
    const wasSpeaking = this.vad.mode !== 'off' && this.vad.isSpeaking;
    this.vad.reset(false);
    this._lastVadUiState = 'paused';
    if (wasSpeaking && this.onStreamEndCallback) {
      this.onStreamEndCallback();
    }
    if (this.onVadStateCallback) {
      this.onVadStateCallback({
        state: 'paused',
        isSpeaking: false,
        savedPct: this.vad.getSavedPercent()
      });
    }
  }
  resume() {
    this.vad.reset(false);
    this._lastVadUiState = null;
    this.isPaused = false;
    if (this.onVadStateCallback) {
      this.onVadStateCallback({
        state: this.vad.mode === 'off' ? 'off' : 'silent',
        isSpeaking: this.vad.mode === 'off',
        savedPct: this.vad.getSavedPercent()
      });
    }
  }

  stop() {
    this.isRecording = false;
    this.isPaused = false;
    if (typeof window !== 'undefined') {
      window._activeAudioSession = null;
    }

    const nodes = ['processorNode', 'analyserNode', 'vadAnalyserNode', 'filterNode', 'compressorNode', 'gainNode', 'highpassNode', 'sourceNode'];
    for (const prop of nodes) {
      if (this[prop]) {
        try { this[prop].disconnect(); } catch (e) {}
        this[prop] = null;
      }
    }
    if (this.mediaStream) {
      try { this.mediaStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.vad.reset(true);
    this._freqData = null;
    this._vadTimeFloat = null;
    this._vadTimeByte = null;
  }

  _downsampleBuffer(buffer, inputSampleRate, outputSampleRate) {
    if (inputSampleRate === outputSampleRate) {
      const len = buffer.length;
      if (!this._cachedBuffer || this._cachedBuffer.length !== len) {
        this._cachedBuffer = new Int16Array(len);
      }
      for (let i = 0; i < len; i++) {
        const s = Math.max(-1, Math.min(1, buffer[i]));
        this._cachedBuffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      return this._cachedBuffer;
    }

    const ratio = inputSampleRate / outputSampleRate;
    const newLength = Math.round(buffer.length / ratio);
    if (!this._cachedBuffer || this._cachedBuffer.length !== newLength) {
      this._cachedBuffer = new Int16Array(newLength);
    }

    const result = this._cachedBuffer;
    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < newLength) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      const avg = count > 0 ? accum / count : 0;
      const s = Math.max(-1, Math.min(1, avg));
      result[offsetResult] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  _int16ToBase64(int16Array) {
    const uint8 = new Uint8Array(int16Array.buffer, int16Array.byteOffset, int16Array.byteLength);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8.byteLength; i += chunkSize) {
      const chunk = uint8.subarray(i, Math.min(i + chunkSize, uint8.byteLength));
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }
}

// ==========================================
// 4. Web Speech API Service (Multilingual Fallback)
// ==========================================
class WebSpeechService {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.isPaused = false;
    this.onInterimCallback = null;
    this.onFinalCallback = null;
    this.onErrorCallback = null;
    this.direction = 'auto';
    this.partnerLang = 'en';
    this.recognitionProfile = 'ja-en-hi-ur';
    this.restartTimer = null;
  }

  isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  _resolveSpeechLang(direction = this.direction, partnerLang = this.partnerLang) {
    if (direction === 'en-to-ja') return 'en-US';
    if (direction === 'ja-to-partner' || direction === 'ja-to-en') return 'ja-JP';
    if (direction === 'bn-to-ja' || direction === 'hi-to-ja' || direction === 'ur-to-ja') {
      return resolveLanguageMeta(direction.split('-')[0]).speechLang;
    }
    if (direction === 'all-to-ja') {
      return partnerLang && partnerLang !== 'ja' ? resolveLanguageMeta(partnerLang).speechLang : 'en-US';
    }
    return 'ja-JP';
  }

  updateSettings({ direction, partnerLang, recognitionProfile } = {}) {
    if (direction !== undefined) this.direction = direction;
    if (partnerLang !== undefined) this.partnerLang = partnerLang;
    if (recognitionProfile !== undefined) this.recognitionProfile = recognitionProfile;

    if (this.recognition && this.isListening) {
      const targetLang = this._resolveSpeechLang(this.direction, this.partnerLang);
      if (this.recognition.lang !== targetLang) {
        this.recognition.lang = targetLang;
        try { this.recognition.stop(); } catch (e) {}
      }
    }
  }

  setDirection(direction) {
    this.updateSettings({ direction });
  }

  _initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.lang = this._resolveSpeechLang(this.direction, this.partnerLang);

    rec.onresult = (event) => {
      if (!this.isListening || this.isPaused) return;

      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          const finalTranscript = item[0].transcript.trim();
          if (finalTranscript.length > 0 && this.onFinalCallback) {
            const detected = detectLanguage(finalTranscript, null, this.recognitionProfile);
            this.onFinalCallback(finalTranscript, detected);
          }
        } else {
          interim += item[0].transcript;
        }
      }
      if (interim && this.onInterimCallback) {
        this.onInterimCallback(interim);
      }
    };

    rec.onerror = (event) => {
      console.warn('[WebSpeech] Error:', event.error);
      if ((event.error === 'not-allowed' || event.error === 'service-not-allowed') && this.onErrorCallback) {
        const msg = isIPadOrIOS()
          ? 'マイクまたは音声認識の使用が許可されていません。iPadの「設定」→「Safari」および「Siriと検索」の音声入力を有効にしてください。'
          : 'マイクの使用が許可されていません。';
        this.onErrorCallback(new Error(msg));
      }
    };

    rec.onend = () => {
      if (!this.isListening || this.isPaused) return;
      clearTimeout(this.restartTimer);
      // iOS Safari での InvalidStateError 回避のため 200ms 遅延で再起動
      this.restartTimer = setTimeout(() => {
        if (!this.isListening || this.isPaused) return;
        try {
          if (this.recognition) this.recognition.start();
        } catch (e) {
          console.warn('[WebSpeech] Restart failed, re-initializing:', e);
          try {
            this.recognition = this._initRecognition();
            if (this.recognition) this.recognition.start();
          } catch (e2) {
            console.error('[WebSpeech] Re-init start failed:', e2);
          }
        }
      }, 200);
    };

    return rec;
  }

  start(direction, onInterim, onFinal, onError, extraOptions = {}) {
    if (!this.isSupported()) {
      const msg = isIPadOrIOS()
        ? 'お使いのブラウザでは音声認識APIが利用できません。iPad/iPhoneでは「Safari」をご利用いただくか、Gemini Liveモードをご利用ください。'
        : 'ブラウザの音声認識 (Web Speech API) が利用できません。Google Chrome または Microsoft Edge をご利用ください。';
      throw new Error(msg);
    }

    this.direction = direction;
    if (extraOptions.partnerLang) this.partnerLang = extraOptions.partnerLang;
    if (extraOptions.recognitionProfile) this.recognitionProfile = extraOptions.recognitionProfile;
    this.onInterimCallback = onInterim;
    this.onFinalCallback = onFinal;
    this.onErrorCallback = onError;
    this.isPaused = false;
    this.isListening = true;

    clearTimeout(this.restartTimer);
    if (this.recognition) {
      try { this.recognition.abort(); } catch (e) {}
    }
    this.recognition = this._initRecognition();
    if (this.recognition) {
      this.recognition.start();
    }
  }

  pause() {
    this.isPaused = true;
    clearTimeout(this.restartTimer);
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }
  }

  resume() {
    this.isPaused = false;
    if (this.isListening && this.recognition) {
      try { this.recognition.start(); } catch (e) {}
    }
  }

  stop() {
    this.isListening = false;
    this.isPaused = false;
    clearTimeout(this.restartTimer);
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
      this.recognition = null;
    }
  }
}

// ==========================================
// 5. Gemini Live WebSocket Client (Tiered Multilingual Bias & Auto-Reconnect)
// ==========================================
class GeminiLiveClient {
  static WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
  static SESSION_RECONNECT_INTERVAL = 570000;
  static MAX_RECONNECT_ATTEMPTS = 5;
  static RECONNECT_DELAYS_MS = Object.freeze([1500, 3000, 5000, 8000, 12000]);
  static MAX_QUEUED_CHUNKS = 80; // 約3.5秒分の音声チャンクを再接続中に保持

  constructor() {
    this.ws = null;
    this.apiKey = null;
    this.direction = 'auto';
    this.recognitionProfile = DEFAULT_SETTINGS.DEFAULT_RECOGNITION_PROFILE;
    this.partnerLang = DEFAULT_SETTINGS.DEFAULT_PARTNER_LANG;
    this.customLangs = [...DEFAULT_SETTINGS.DEFAULT_CUSTOM_LANGS];
    this.modelName = DEFAULT_SETTINGS.DEFAULT_LIVE_MODEL;
    this.isConnected = false;
    this.isSetupComplete = false;
    this.isReconnecting = false;
    this.manualDisconnect = false;
    this.reconnectAttempt = 0;
    this.chunkQueue = [];
    this.systemInstruction = null;
    this._fallbackEmptyLangCodes = false;

    this._connectResolve = null;
    this._connectReject = null;
    this._connectTimeout = null;
    this._sessionTimer = null;
    this._reconnectTimer = null;
    this._onlineHandler = null;

    this.onInterimCallback = null;
    this.onFinalCallback = null;
    this.onTurnCompleteCallback = null;
    this.onErrorCallback = null;
    this.onReconnectingCallback = null;
    this.onReconnectedCallback = null;
    this.onDisconnectCallback = null;
    this.onLogCallback = null;
  }

  log(type, message) {
    if (this.onLogCallback) {
      this.onLogCallback(type, `[GeminiLive] ${message}`);
    }
  }

  _getSetupSignature() {
    return JSON.stringify({
      codes: this._resolveLanguageCodes(),
      inst: this._buildEffectiveSystemInstruction()
    });
  }

  updateRecognitionSettings({ direction, recognitionProfile, partnerLang, customLangs, systemInstruction } = {}) {
    const prevSig = this._getSetupSignature();
    if (direction !== undefined) this.direction = direction;
    if (recognitionProfile !== undefined && RECOGNITION_PROFILES[recognitionProfile]) {
      this.recognitionProfile = recognitionProfile;
      this._fallbackEmptyLangCodes = false;
    }
    if (partnerLang !== undefined) this.partnerLang = normalizeLangCode(partnerLang) || 'en';
    if (Array.isArray(customLangs) && customLangs.length > 0) {
      this.customLangs = customLangs.map((c) => normalizeLangCode(c)).filter(Boolean);
      this._fallbackEmptyLangCodes = false;
    }
    if (systemInstruction !== undefined) {
      this.systemInstruction = systemInstruction || DEFAULT_SYSTEM_INSTRUCTION;
    }

    const nextSig = this._getSetupSignature();
    if (prevSig !== nextSig && this.isConnected && this.ws && !this.isReconnecting) {
      this.log(
        'info',
        `認識設定変更 (プロファイル: ${this.recognitionProfile} / 方向: ${this.direction}) をエンジンへ即時反映するためシームレス再接続します...`
      );
      this._seamlessReconnect()
        .then(() => {
          this.log('success', `認識言語設定の再適用が完了しました。`);
        })
        .catch((err) => {
          this.log('warn', `設定切替に伴う再接続失敗: ${err.message}`);
          if (!this.manualDisconnect) {
            this._startAutoReconnectLoop(err.closeCode || 1006, err.message);
          }
        });
    }
  }

  setDirection(direction) {
    this.updateRecognitionSettings({ direction });
  }

  _normalizeModelName(model) {
    if (!model) return DEFAULT_SETTINGS.DEFAULT_LIVE_MODEL;
    return model.startsWith('models/') ? model : `models/${model}`;
  }

  _isNonRetryableCloseCode(code) {
    return code === 1007 || code === 1008;
  }

  _enqueueChunk(base64Pcm) {
    if (!base64Pcm) return;
    if (this.chunkQueue.length >= GeminiLiveClient.MAX_QUEUED_CHUNKS) {
      this.chunkQueue.shift();
    }
    this.chunkQueue.push(base64Pcm);
  }

  connect(apiKey, direction, modelName, systemInstruction = null, options = {}) {
    const preserveQueue = !!options.preserveQueue;
    if (options.recognitionProfile && RECOGNITION_PROFILES[options.recognitionProfile]) {
      this.recognitionProfile = options.recognitionProfile;
    }
    if (options.partnerLang) {
      this.partnerLang = normalizeLangCode(options.partnerLang) || 'en';
    }
    if (Array.isArray(options.customLangs) && options.customLangs.length > 0) {
      this.customLangs = options.customLangs.map((c) => normalizeLangCode(c)).filter(Boolean);
    }
    if (!preserveQueue && !options._retryingEmptyLangCodes) {
      this._fallbackEmptyLangCodes = false;
    }

    return new Promise((resolve, reject) => {
      this.apiKey = apiKey;
      this.direction = direction;
      this.modelName = this._normalizeModelName(modelName);
      this.systemInstruction = systemInstruction || DEFAULT_SYSTEM_INSTRUCTION;
      this.manualDisconnect = false;
      this.isSetupComplete = false;
      this.isConnected = false;
      if (!preserveQueue) {
        this.chunkQueue = [];
        this.reconnectAttempt = 0;
      }

      this._cleanupTimeout();
      this._connectResolve = resolve;
      this._connectReject = reject;

      if (!apiKey) {
        this._connectResolve = null;
        this._connectReject = null;
        return reject(new Error('Gemini API キーが未設定です。'));
      }

      const url = `${GeminiLiveClient.WS_URL}?key=${encodeURIComponent(this.apiKey)}`;
      this.log('info', `WebSocket接続開始: ${this.modelName}${preserveQueue ? ' (再接続)' : ''}`);

      let socket;
      try {
        socket = new WebSocket(url);
        this.ws = socket;
      } catch (err) {
        this.log('error', `WebSocket作成失敗: ${err.message}`);
        this._connectResolve = null;
        this._connectReject = null;
        return reject(new Error(`WebSocket初期化エラー: ${err.message}`));
      }

      this._connectTimeout = setTimeout(() => {
        if (this.ws !== socket || this.isSetupComplete) return;
        const timeoutErr = new Error('Gemini Live API への接続がタイムアウトしました。');
        this.log('warn', '接続タイムアウト (10秒)');
        const pendingReject = this._connectReject;
        this._connectResolve = null;
        this._connectReject = null;
        try { socket.close(); } catch (e) {}
        if (this.ws === socket) this.ws = null;
        if (pendingReject) pendingReject(timeoutErr);
      }, 10000);

      socket.onopen = () => {
        if (this.ws !== socket || this.manualDisconnect) {
          try { socket.close(); } catch (e) {}
          return;
        }
        this.log('info', 'WebSocket接続オープン。Setup送信中...');
        this._sendSetupMessage(socket);
      };

      socket.onmessage = async (event) => {
        if (this.ws !== socket || this.manualDisconnect) return;
        let raw = event.data;
        if (event.data instanceof Blob) {
          raw = await event.data.text();
        }
        if (this.ws !== socket || this.manualDisconnect) return;
        this._handleServerMessage(raw);
      };

      socket.onerror = () => {
        if (this.ws !== socket) return;
        this.log('error', 'WebSocket通信エラーを検知しました（切断コードを確認中...）。');
      };

      socket.onclose = (event) => {
        if (this.ws !== socket) return;
        this.log('warn', `WebSocket切断: Code ${event.code}${event.reason ? ` (${event.reason})` : ''}`);
        this._cleanupTimeout();
        this._clearSessionTimer();

        const wasEstablished = this.isConnected && this.isSetupComplete;
        this.isConnected = false;
        this.isSetupComplete = false;
        this.ws = null;

        if (this._connectReject) {
          // 特定のBCP-47言語コードがサーバー側で拒否された場合 (1007)、自動言語識別 (languageCodes: []) で1回だけ自動リトライ
          if (
            event.code === 1007 &&
            !this._fallbackEmptyLangCodes &&
            this._resolveLanguageCodes().length > 0 &&
            !this.manualDisconnect
          ) {
            this.log(
              'warn',
              '指定BCP-47言語コードの一部が非対応のため (Code: 1007)、自動言語識別 (languageCodes: []) に切り替えて即時再接続します...'
            );
            this._fallbackEmptyLangCodes = true;
            const pendingResolve = this._connectResolve;
            const pendingReject = this._connectReject;
            this._connectResolve = null;
            this._connectReject = null;
            this.connect(this.apiKey, this.direction, this.modelName, this.systemInstruction, {
              preserveQueue,
              _retryingEmptyLangCodes: true
            }).then(pendingResolve, pendingReject);
            return;
          }

          let errorMsg = `接続が切断されました (Code: ${event.code})`;
          if (event.code === 1006) {
            errorMsg = 'Gemini Live APIに接続できませんでした (Code: 1006)。通信状態・APIキーまたはモデル権限を確認してください。';
          } else if (event.code === 1007 || event.code === 1008) {
            errorMsg = `認証またはリクエスト形式エラーです (Code: ${event.code})`;
          }
          const err = new Error(errorMsg);
          err.closeCode = event.code;
          const pendingReject = this._connectReject;
          this._connectResolve = null;
          this._connectReject = null;
          pendingReject(err);
          return;
        }

        if (this.manualDisconnect || this.isReconnecting) return;

        if (wasEstablished) {
          if (this._isNonRetryableCloseCode(event.code)) {
            this.log('error', `回復不能な切断コード (${event.code}) のため自動再接続を中止します。`);
            if (this.onDisconnectCallback) {
              this.onDisconnectCallback(event.code, event.reason, false);
            }
            return;
          }
          this._startAutoReconnectLoop(event.code, event.reason);
        }
      };
    });
  }

  _cleanupTimeout() {
    if (this._connectTimeout) {
      clearTimeout(this._connectTimeout);
      this._connectTimeout = null;
    }
  }

  _clearSessionTimer() {
    if (this._sessionTimer) {
      clearTimeout(this._sessionTimer);
      this._sessionTimer = null;
    }
  }

  _clearReconnectTimer() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._onlineHandler && typeof window !== 'undefined') {
      window.removeEventListener('online', this._onlineHandler);
      this._onlineHandler = null;
    }
  }

  _startSessionResumptionTimer() {
    this._clearSessionTimer();
    this._sessionTimer = setTimeout(async () => {
      if (this.manualDisconnect || this.isReconnecting) return;
      this.log('info', 'Gemini Live 10分セッション制限に伴う自動シームレス再接続を実行します...');
      try {
        await this._seamlessReconnect();
        this.log('success', 'シームレス再接続完了。セッションが継続更新されました。');
      } catch (err) {
        this.log('warn', `セッション定期更新失敗 (${err.message})。自動リトライへ移行します...`);
        if (!this.manualDisconnect) {
          this._startAutoReconnectLoop(err.closeCode || 1006, err.message);
        }
      }
    }, GeminiLiveClient.SESSION_RECONNECT_INTERVAL);
  }

  async _seamlessReconnect() {
    if (this.manualDisconnect) return;
    this.isReconnecting = true;
    const oldSocket = this.ws;
    this.ws = null;
    this.isConnected = false;
    this.isSetupComplete = false;
    this._clearSessionTimer();

    if (oldSocket) {
      try {
        if (oldSocket.readyState === WebSocket.OPEN) {
          oldSocket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
        }
        oldSocket.close();
      } catch (e) {}
    }

    try {
      await this.connect(this.apiKey, this.direction, this.modelName, this.systemInstruction, { preserveQueue: true });
      this.isReconnecting = false;
      this.reconnectAttempt = 0;
    } catch (err) {
      this.isReconnecting = false;
      throw err;
    }
  }

  _startAutoReconnectLoop(code, reason = '') {
    if (this.manualDisconnect || this.isReconnecting) return;
    this.isReconnecting = true;
    this.reconnectAttempt = 0;
    this._scheduleNextReconnect(code, reason);
  }

  _scheduleNextReconnect(lastCode, lastReason = '') {
    if (this.manualDisconnect) {
      this.isReconnecting = false;
      this._clearReconnectTimer();
      return;
    }

    this.reconnectAttempt += 1;
    const maxAttempts = GeminiLiveClient.MAX_RECONNECT_ATTEMPTS;

    if (this.reconnectAttempt > maxAttempts) {
      this.log('error', `自動再接続が上限 (${maxAttempts}回) に達しました。セッションを終了します。`);
      this.isReconnecting = false;
      this._clearReconnectTimer();
      this.chunkQueue = [];
      if (this.onDisconnectCallback) {
        this.onDisconnectCallback(lastCode, lastReason || `自動再接続上限 (${maxAttempts}回) 到達`, true);
      }
      return;
    }

    const delayIdx = Math.min(this.reconnectAttempt - 1, GeminiLiveClient.RECONNECT_DELAYS_MS.length - 1);
    const delayMs = GeminiLiveClient.RECONNECT_DELAYS_MS[delayIdx];
    const attemptNum = this.reconnectAttempt;

    this.log(
      'warn',
      `回線瞬断検知 (Code: ${lastCode})。${(delayMs / 1000).toFixed(1)}秒後に自動再接続を試行します (${attemptNum}/${maxAttempts}回目)...`
    );

    if (this.onReconnectingCallback) {
      this.onReconnectingCallback(attemptNum, maxAttempts, delayMs, lastCode);
    }

    const executeAttempt = async () => {
      this._clearReconnectTimer();
      if (this.manualDisconnect) {
        this.isReconnecting = false;
        return;
      }

      this.log('info', `自動再接続を実行中 (${attemptNum}/${maxAttempts}回目)...`);
      try {
        await this.connect(this.apiKey, this.direction, this.modelName, this.systemInstruction, { preserveQueue: true });
        if (this.manualDisconnect) {
          this.disconnect();
          return;
        }
        this.isReconnecting = false;
        const recoveredOnAttempt = this.reconnectAttempt;
        this.reconnectAttempt = 0;
        this.log('success', `自動再接続に成功しました (${recoveredOnAttempt}回目で復帰)。音声認識を継続します。`);
        if (this.onReconnectedCallback) {
          this.onReconnectedCallback(recoveredOnAttempt);
        }
      } catch (err) {
        if (this.manualDisconnect) {
          this.isReconnecting = false;
          return;
        }
        const errCode = err.closeCode || lastCode || 1006;
        this.log('warn', `自動再接続 ${attemptNum}/${maxAttempts}回目失敗: ${err.message}`);
        if (this._isNonRetryableCloseCode(errCode)) {
          this.isReconnecting = false;
          this.chunkQueue = [];
          if (this.onDisconnectCallback) {
            this.onDisconnectCallback(errCode, err.message, false);
          }
          return;
        }
        this._scheduleNextReconnect(errCode, err.message);
      }
    };

    this._clearReconnectTimer();
    this._reconnectTimer = setTimeout(executeAttempt, delayMs);

    if (typeof window !== 'undefined') {
      this._onlineHandler = () => {
        if (!this.manualDisconnect && this.isReconnecting && this._reconnectTimer) {
          this.log('info', 'ネットワーク復帰を検知しました。待機をスキップして即座に再接続を試行します...');
          executeAttempt();
        }
      };
      window.addEventListener('online', this._onlineHandler, { once: true });
    }
  }

  disconnect() {
    this.manualDisconnect = true;
    this._cleanupTimeout();
    this._clearSessionTimer();
    this._clearReconnectTimer();
    this.isReconnecting = false;
    this.reconnectAttempt = 0;
    this._connectResolve = null;
    this._connectReject = null;

    const oldSocket = this.ws;
    this.ws = null;
    if (oldSocket) {
      if (oldSocket.readyState === WebSocket.OPEN) {
        try { oldSocket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } })); } catch (e) {}
      }
      try { oldSocket.close(); } catch (e) {}
    }
    this.isConnected = false;
    this.isSetupComplete = false;
    this.chunkQueue = [];
  }

  sendAudioChunk(base64Pcm) {
    if (this.manualDisconnect) return;

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isSetupComplete) {
      if (this.isReconnecting || (this.ws && (this.ws.readyState === WebSocket.CONNECTING || !this.isSetupComplete))) {
        this._enqueueChunk(base64Pcm);
      }
      return;
    }

    while (this.chunkQueue.length > 0) {
      this._dispatchChunk(this.chunkQueue.shift());
    }
    this._dispatchChunk(base64Pcm);
  }

  _dispatchChunk(base64Data) {
    const payload = {
      realtimeInput: {
        audio: {
          data: base64Data,
          mimeType: 'audio/pcm;rate=16000'
        }
      }
    };
    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(payload));
      }
    } catch (e) {
      console.warn('Failed to send audio chunk:', e);
    }
  }

  sendAudioStreamEnd() {
    if (this.manualDisconnect || !this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isSetupComplete) {
      return;
    }
    try {
      this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
      this.log('info', 'VAD無音遷移: audioStreamEnd 送信（末尾認識を確定し無音送信を休止）');
    } catch (e) {
      console.warn('Failed to send audioStreamEnd:', e);
    }
  }

  _resolveLanguageCodes() {
    if (this._fallbackEmptyLangCodes) return [];

    // 1. 翻訳方向の厳密単一言語ロック
    if (this.direction === 'en-to-ja') return ['en-US', 'en-IN'];
    if (this.direction === 'ja-to-partner' || this.direction === 'ja-to-en') return ['ja-JP'];
    if (this.direction === 'bn-to-ja') return ['bn-BD', 'bn-IN', 'en-US'];
    if (this.direction === 'hi-to-ja') return ['hi-IN', 'en-US'];
    if (this.direction === 'ur-to-ja') return ['ur-PK', 'en-US'];

    // 2. 認識プロファイル別のBCP-47音響バイアス解決
    if (this.recognitionProfile === 'strict-ja-en') {
      return ['ja-JP', 'en-US', 'en-IN'];
    }
    if (this.recognitionProfile === 'multilingual-auto') {
      // 空配列により Gemini 3.5 Transcribe Live の85+言語自動識別＆コードスイッチングを有効化
      return [];
    }
    if (this.recognitionProfile === 'multilingual-custom') {
      const codes = new Set();
      const selected = Array.isArray(this.customLangs) && this.customLangs.length > 0
        ? this.customLangs
        : DEFAULT_SETTINGS.DEFAULT_CUSTOM_LANGS;
      for (const lang of selected) {
        const meta = resolveLanguageMeta(lang);
        for (const c of meta.bcp47) codes.add(c);
      }
      if ((this.direction === 'auto' || this.direction === 'all-to-partner') && this.partnerLang) {
        for (const c of resolveLanguageMeta(this.partnerLang).bcp47) codes.add(c);
      }
      return codes.size > 0 ? Array.from(codes) : ['ja-JP', 'en-US'];
    }

    // 既定: 'ja-en-hi-ur'（日英最優先 ＋ 英語雑談内のヒンディー語・ウルドゥー語補足）
    const baseCodes = new Set(RECOGNITION_PROFILES['ja-en-hi-ur'].languageCodes);
    // 相手言語が明示的に別の言語（ベンガル語・ベトナム語・スペイン語等）へ変更されている場合は認識候補にも自動追加
    if (
      (this.direction === 'auto' || this.direction === 'all-to-partner') &&
      this.partnerLang &&
      !['ja', 'en', 'hi', 'ur'].includes(this.partnerLang)
    ) {
      for (const c of resolveLanguageMeta(this.partnerLang).bcp47) {
        baseCodes.add(c);
      }
    }
    return Array.from(baseCodes);
  }

  _buildEffectiveSystemInstruction() {
    const rawUserInstruction = (this.systemInstruction || '').trim();
    const isDefault = isDefaultOrLegacySystemInstruction(rawUserInstruction);

    const directionLocks = {
      'en-to-ja':
        'STRICT LANGUAGE LOCK (ENGLISH ONLY): You are transcribing spoken English. ' +
        'Transcribe ALL speech STRICTLY in English using standard Latin alphabet characters ONLY. ' +
        'Even if the speaker has a South Asian (Indian/Pakistani/Bangladeshi), Japanese, or other non-native accent, or if audio is noisy, ' +
        'ALWAYS transcribe it as English words in the Latin alphabet. ' +
        'NEVER output Hindi (Devanagari), Urdu/Arabic, Bengali, Japanese, Korean, or any non-Latin characters.',
      'ja-to-partner':
        'STRICT LANGUAGE LOCK (JAPANESE ONLY): You are transcribing spoken Japanese. ' +
        'Transcribe ALL speech STRICTLY in natural Japanese (kanji, hiragana, katakana, and standard English technical abbreviations). ' +
        'NEVER output Hindi, Urdu, Bengali, Korean, or other foreign scripts.',
      'ja-to-en':
        'STRICT LANGUAGE LOCK (JAPANESE ONLY): You are transcribing spoken Japanese. ' +
        'Transcribe ALL speech STRICTLY in natural Japanese (kanji, hiragana, katakana, and standard English technical abbreviations). ' +
        'NEVER output Hindi, Urdu, Bengali, Korean, or other foreign scripts.',
      'bn-to-ja':
        'STRICT LANGUAGE LOCK (BENGALI & ENGLISH ONLY): Transcribe speech ONLY in Bengali (বাংলা) and/or English (for code-mixing/technical terms).',
      'hi-to-ja':
        'STRICT LANGUAGE LOCK (HINDI & ENGLISH ONLY): Transcribe speech ONLY in Hindi (हिन्दी) and/or English (for code-mixing/technical terms).',
      'ur-to-ja':
        'STRICT LANGUAGE LOCK (URDU & ENGLISH ONLY): Transcribe speech ONLY in Urdu (اردو) and/or English (for code-mixing/technical terms).'
    };

    const dirLock = directionLocks[this.direction];
    if (dirLock) {
      return isDefault ? dirLock : `${rawUserInstruction}\n\n[HIGHEST PRIORITY OVERRIDE - ${dirLock}]`;
    }

    let profileInstruction = DEFAULT_SYSTEM_INSTRUCTION;
    if (this.recognitionProfile === 'strict-ja-en') {
      profileInstruction =
        'STRICT BILINGUAL LOCK (JAPANESE & ENGLISH ONLY): Transcribe speech ONLY into natural Japanese (日本語) or English (Latin alphabet). ' +
        'Even if speakers have strong regional accents or background noise is present, ALWAYS transcribe as English or Japanese. ' +
        'NEVER output Devanagari, Urdu/Arabic, Bengali, Korean, Cyrillic, or any other scripts.';
    } else if (this.recognitionProfile === 'multilingual-auto') {
      profileInstruction =
        'MULTILINGUAL SPEECH TRANSCRIPTION (85+ LANGUAGES WITH EN/JA TOP PRIORITY): ' +
        '1. Give top priority to English and Japanese (日本語) whenever speech is accented English, Japanese, or ambiguous short technical phrases. ' +
        '2. Accurately transcribe any clearly spoken global language (including Japanese, English, Hindi, Urdu, Bengali, Chinese, Korean, Vietnamese, Indonesian, Filipino/Tagalog, Thai, Burmese, Arabic, Persian, Turkish, Spanish, French, German, Portuguese, Russian, Italian, etc.) in its natural script, including Hindi/Urdu casual phrases mixed into English conversation (code-switching). ' +
        '3. Do not hallucinate text or random scripts during silence or background noise.';
    } else if (this.recognitionProfile === 'multilingual-custom') {
      const activeCodes = new Set(this.customLangs.length > 0 ? this.customLangs : DEFAULT_SETTINGS.DEFAULT_CUSTOM_LANGS);
      if ((this.direction === 'auto' || this.direction === 'all-to-partner') && this.partnerLang) {
        activeCodes.add(this.partnerLang);
      }
      const langNames = Array.from(activeCodes).map((c) => resolveLanguageMeta(c).englishName).join(', ');
      profileInstruction =
        `CUSTOM MULTILINGUAL TRANSCRIPTION: Only transcribe speech into the following enabled languages: ${langNames}. ` +
        'Give highest priority to English and Japanese when enabled, and naturally handle code-switching (such as Hindi/Urdu words mixed in English). ' +
        'Do not transcribe into any unlisted languages.';
    } else if (
      (this.direction === 'auto' || this.direction === 'all-to-partner') &&
      this.partnerLang &&
      !['ja', 'en', 'hi', 'ur'].includes(this.partnerLang)
    ) {
      const partnerName = resolveLanguageMeta(this.partnerLang).englishName;
      profileInstruction =
        `${DEFAULT_SYSTEM_INSTRUCTION} Additionally, ${partnerName} is enabled as an active conversation language—transcribe clearly spoken ${partnerName} accurately in its standard script.`;
    }

    if (isDefault) return profileInstruction;
    return `${rawUserInstruction}\n\n[ACTIVE PROFILE GUIDANCE]: ${profileInstruction}`;
  }

  _sendSetupMessage(targetSocket = null) {
    const sock = targetSocket || this.ws;
    if (!sock || sock.readyState !== WebSocket.OPEN) return;

    const languageCodes = this._resolveLanguageCodes();
    const effectiveInstruction = this._buildEffectiveSystemInstruction();

    const setupPayload = {
      setup: {
        model: this.modelName,
        generationConfig: { responseModalities: ['TEXT'] },
        systemInstruction: { parts: [{ text: effectiveInstruction }] },
        inputAudioTranscription: { languageCodes }
      }
    };

    const langLabel = languageCodes.length > 0 ? languageCodes.join(', ') : 'AUTO (85+多言語自動識別)';
    this.log('info', `Setup送信 (プロファイル: ${this.recognitionProfile} | 方向: ${this.direction} | 言語指定: ${langLabel})`);
    sock.send(JSON.stringify(setupPayload));
  }

  _handleServerMessage(rawMessage) {
    try {
      const data = typeof rawMessage === 'string' ? JSON.parse(rawMessage) : rawMessage;

      if (data.setupComplete) {
        this.log('success', 'SetupComplete 受信。音声認識ストリーム準備完了 (audio単一送信モード)。');
        this.isConnected = true;
        this.isSetupComplete = true;
        this._cleanupTimeout();
        this._startSessionResumptionTimer();

        if (this._connectResolve) {
          const pendingResolve = this._connectResolve;
          this._connectResolve = null;
          this._connectReject = null;
          pendingResolve();
        }

        if (this.chunkQueue.length > 0) {
          this.log('info', `再接続中に保持していた音声バッファ (${this.chunkQueue.length}チャンク) を一括送信します...`);
        }
        while (this.chunkQueue.length > 0) {
          this._dispatchChunk(this.chunkQueue.shift());
        }
        return;
      }

      if (data.serverContent) {
        const sc = data.serverContent;
        const interimObj = sc.interimInputTranscription || sc.interim_input_transcription;
        if (interimObj && typeof interimObj.text === 'string' && interimObj.text.length > 0 && this.onInterimCallback) {
          this.onInterimCallback(interimObj.text);
        }

        const finalObj = sc.inputTranscription || sc.input_transcription;
        if (finalObj && typeof finalObj.text === 'string' && finalObj.text.length > 0) {
          const rawFinalText = finalObj.text;
          const langCode = finalObj.languageCode || null;
          if (rawFinalText.trim().length > 0) {
            this.log('info', `認識断片受信: "${rawFinalText.trim()}"`);
          }
          if (this.onFinalCallback) {
            this.onFinalCallback(rawFinalText, langCode);
          }
        }

        if ((sc.turnComplete || sc.turn_complete) && this.onTurnCompleteCallback) {
          this.onTurnCompleteCallback();
        }
      }
    } catch (e) {
      console.warn('Server message parse error:', e);
    }
  }
}

// ==========================================
// 6. Shared Gemini Text Client (Cascade Fallback + Preferred Model Cache)
// ==========================================
class GeminiTextClient {
  constructor() {
    this._preferredModel = null;
    this.onLogCallback = null;
  }

  log(type, tag, message) {
    if (this.onLogCallback) {
      this.onLogCallback(type, `[${tag}] ${message}`);
    }
  }

  async generateText({ apiKey, prompt, temperature = 0.15, maxOutputTokens = 2048, timeoutMs = 20000, logTag = 'Gemini' }) {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('Gemini APIキーが未設定です。');
    }

    const baseModels = DEFAULT_SETTINGS.GEMINI_TEXT_MODELS;
    const modelsToTry = this._preferredModel
      ? [this._preferredModel, ...baseModels.filter((m) => m !== this._preferredModel)]
      : baseModels;

    let lastError = 'Gemini API 応答を取得できませんでした。';

    for (const modelName of modelsToTry) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
      try {
        const res = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature, maxOutputTokens }
          })
        }, timeoutMs);

        if (res.ok) {
          const data = await res.json();
          const outText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (typeof outText === 'string' && outText.trim().length > 0) {
            this._preferredModel = modelName;
            return { text: outText.trim(), model: modelName };
          }
          lastError = `Gemini (${modelName}): 空の応答を受信`;
        } else {
          const errData = await res.json().catch(() => null);
          const errDetail = errData?.error?.message || `HTTP ${res.status}`;
          lastError = `Gemini (${modelName}): ${errDetail}`;
          if (this._preferredModel === modelName) this._preferredModel = null;
          this.log('warn', logTag, `Gemini (${modelName}) 失敗: ${errDetail}`);
        }
      } catch (err) {
        if (this._preferredModel === modelName) this._preferredModel = null;
        const reason = err.name === 'AbortError' ? `タイムアウト (${Math.round(timeoutMs / 1000)}秒)` : err.message;
        lastError = `Gemini (${modelName}): ${reason}`;
        this.log('warn', logTag, `Gemini (${modelName}) 通信エラー: ${reason}`);
      }
    }

    throw new Error(lastError);
  }
}

// ==========================================
// 7. Translation Service & Resilient FIFO Queue (Multilingual + Code-Switch Nuance)
// ==========================================
class TranslationService {
  constructor(geminiTextClient) {
    this.textClient = geminiTextClient;
    this.queue = [];
    this.isProcessing = false;
    this.onLogCallback = null;
  }

  log(type, message) {
    if (this.onLogCallback) {
      this.onLogCallback(type, `[Translation] ${message}`);
    }
  }

  enqueue(
    text,
    direction,
    category,
    apiKey,
    gasUrl,
    gasToken,
    recordId,
    onComplete,
    contextProvider = null,
    customPrompt = '',
    extraOptions = {}
  ) {
    this.queue.push({
      text,
      direction,
      category,
      apiKey,
      gasUrl,
      gasToken,
      recordId,
      onComplete,
      contextProvider,
      customPrompt,
      partnerLang: extraOptions.partnerLang || 'en',
      recognitionProfile: extraOptions.recognitionProfile || 'ja-en-hi-ur',
      hintedLangCode: extraOptions.hintedLangCode || null
    });
    this._processNext();
  }

  async _processNext() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const job = this.queue.shift();
    try {
      let resolvedContext = [];
      if (typeof job.contextProvider === 'function') {
        try {
          resolvedContext = job.contextProvider() || [];
        } catch (ctxErr) {
          this.log('warn', `前文脈取得時エラー: ${ctxErr.message}`);
        }
      } else if (Array.isArray(job.contextProvider)) {
        resolvedContext = job.contextProvider;
      }

      const result = await this._executeTranslation({ ...job, contextRecords: resolvedContext });
      if (job.onComplete) {
        job.onComplete(job.recordId, result);
      }
    } catch (err) {
      this.log('error', `翻訳ジョブ致命的エラー: ${err.message}`);
      if (job.onComplete) {
        job.onComplete(job.recordId, { translated: '【翻訳エラー / 再試行可能】', speakerLang: 'auto' });
      }
    } finally {
      this.isProcessing = false;
      this._processNext();
    }
  }

  _tailSnippet(str, maxChars) {
    const clean = String(str || '').replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    return clean.length <= maxChars ? clean : '…' + clean.slice(-maxChars).trim();
  }

  _resolveLanguagePair(text, direction, partnerLang = 'en', hintedLangCode = null, recognitionProfile = 'ja-en-hi-ur') {
    return resolveTranslationRoute(text, direction, partnerLang, hintedLangCode, recognitionProfile);
  }

  _buildDomainHint(category) {
    if (!category || category === 'Common') {
      return ' Domain context: General international business meeting, technical discussion, and workplace communication.';
    }
    if (category === 'Casual') {
      return ' Domain context: Casual workplace conversation, informal small talk, and everyday team discussion.';
    }
    return ` Domain context: Maritime Ship Recycling / Safety Audit (${category}). Use accurate regulatory and technical terminology.`;
  }

  _buildPrompt({ text, direction, category, srcLang, targetLang, langInfo, recognitionProfile, validContext, customPrompt }) {
    const srcMeta = resolveLanguageMeta(srcLang);
    const targetMeta = resolveLanguageMeta(targetLang);
    const srcName = srcMeta.englishName || 'the source language';
    const targetName = targetMeta.englishName || 'Japanese';

    let contextBlock = '';
    if (validContext.length > 0) {
      const earlierItems = validContext.slice(0, -1);
      const immediatePrev = validContext[validContext.length - 1];
      const sections = [];

      if (earlierItems.length > 0) {
        const earlierLines = earlierItems.map((c, idx) => {
          const spk = c.speaker ? `[${c.speaker}] ` : '';
          const origSnippet = this._tailSnippet(c.original, 320);
          const transSnippet = this._tailSnippet(c.translated, 320);
          return `  (${idx + 1}) ${spk}Original: ${origSnippet}${transSnippet ? `\n      Translation: ${transSnippet}` : ''}`;
        });
        sections.push('Earlier turns (oldest to newer):\n' + earlierLines.join('\n'));
      }

      if (immediatePrev) {
        const spk = immediatePrev.speaker ? `[${immediatePrev.speaker}] ` : '';
        const origSnippet = this._tailSnippet(immediatePrev.original, 800);
        const transSnippet = this._tailSnippet(immediatePrev.translated, 800);
        sections.push(
          'Immediately preceding turn (HIGHEST PRIORITY for continuity):\n' +
          `  ${spk}Original: ${origSnippet}` +
          (transSnippet ? `\n  Translation: ${transSnippet}` : '')
        );
      }

      contextBlock =
        '[Previous Conversation Context — FOR CONTEXTUAL CONTINUITY ONLY. NEVER RE-TRANSLATE OR REPEAT THIS SECTION]\n' +
        sections.join('\n\n') + '\n\n';
    }

    const domainHint = this._buildDomainHint(category);

    const longFormInstruction = targetLang === 'ja'
      ? '5. The input may contain multiple sentences or spoken ASR fragments with minor filler/stutters. Translate the ENTIRE passage as one cohesive, natural, well-structured Japanese paragraph that preserves logical flow, causality, and nuance—do NOT produce choppy literal clause-by-clause translations.\n'
      : `5. Produce fluent, natural, and well-structured ${targetName} preserving the speaker's complete meaning, tone, and logical flow.\n`;

    const contextUsageInstruction = validContext.length > 0
      ? (targetLang === 'ja'
        ? '6. CONTEXT-AWARE JAPANESE TRANSLATION: Actively use [Previous Conversation Context] so the Japanese translation flows seamlessly from prior turns:\n' +
          '   - Resolve ambiguous pronouns (it, they, this, that, there, the same, so, etc.) and omitted subjects/objects using the prior context, explicitly clarifying the referent in natural Japanese whenever needed for readability.\n' +
          '   - If [Text to Translate] continues a sentence or explanation from the immediately preceding turn (e.g., due to speech segmentation), connect smoothly in logic, tense, and nuance without duplicating what was already translated.\n' +
          '   - If the preceding turn was a question or remark by another speaker, phrase the Japanese naturally as a response or follow-up to it.\n' +
          '   - Keep technical terminology, proper nouns, abbreviations, and register/politeness consistent with the previous Japanese translations.\n' +
          '   - If ASR misheard a technical term in [Text to Translate], disambiguate it using the topic established in the prior context.\n'
        : `6. CONTEXT-AWARE TRANSLATION: Use [Previous Conversation Context] to resolve pronouns, omitted subjects, and domain terminology consistently with previous turns in ${targetName}, ensuring natural continuity without re-translating prior turns.\n`)
      : '';

    const isStrictEnglishToJa = direction === 'en-to-ja';
    const isStrictJaSource = direction === 'ja-to-partner' || direction === 'ja-to-en';
    const hasHiUrMix =
      (Array.isArray(langInfo?.mixedSubLangs) && langInfo.mixedSubLangs.some((l) => l === 'hi' || l === 'ur')) ||
      langInfo?.colloquialMix === 'hi-ur';

    let culturalContextLine = '';
    let constraint3And4 = '';

    if (isStrictEnglishToJa) {
      culturalContextLine =
        'Context: The speaker is speaking English (possibly with a non-native accent). If minor speech-recognition artifacts appear, infer the intended English meaning from surrounding context.\n';
      constraint3And4 =
        '3. Treat the input strictly as English speech to be translated into natural Japanese.\n' +
        '4. Do not leave stray foreign words untranslated; express the complete intended meaning clearly in natural Japanese.\n';
    } else if (isStrictJaSource) {
      culturalContextLine =
        'Context: The speaker is speaking Japanese.\n';
      constraint3And4 =
        `3. Treat the input strictly as Japanese speech to be translated into natural, idiomatic ${targetName}.\n` +
        '4. Preserve technical abbreviations and proper nouns (e.g., HKC, IHM, EU-SRR, HSE) accurately.\n';
    } else if (hasHiUrMix || recognitionProfile === 'ja-en-hi-ur') {
      culturalContextLine =
        'Context: Primary priority is accurate English and Japanese comprehension. However, in casual English conversation, speakers may mix in Hindi (हिन्दी) or Urdu (اردو) words, greetings, fillers, or side-remarks (either in Devanagari/Urdu script or Romanized Hinglish/Roman Urdu such as "accha", "theek hai", "bhai", "yaar", "inshallah", "shukriya", "nahi", "chalo", "lekin", "abhi", "kal").\n';
      constraint3And4 =
        '3. Prioritize standard English and Japanese meanings first whenever phrasing is standard English/Japanese or technical terminology.\n' +
        `4. When Hindi or Urdu words/phrases are mixed into English speech (code-switching), do NOT leave them untranslated or misread them as English typos—seamlessly integrate their conversational meaning and nuance (agreement, hesitation, friendliness, timing) into natural ${targetName}.\n`;
    } else {
      culturalContextLine =
        'Context: Multilingual conversation where speakers may use any global language or code-switch (including English mixed with Hindi, Urdu, Bengali, or other local languages).\n';
      constraint3And4 =
        `3. Accurately interpret ${srcName} as well as any code-switched English, Hindi, Urdu, or other phrases within [Text to Translate], giving priority to English/Japanese accuracy on technical acronyms.\n` +
        `4. Express the complete intended meaning seamlessly in natural ${targetName} without leaving untranslated fragments.\n`;
    }

    const trimmedCustomPrompt = String(customPrompt || '').trim();
    const customPromptBlock = trimmedCustomPrompt
      ? `[Additional Theme & Nuance Instructions — Follow these tone, domain, and terminology preferences while STRICTLY obeying constraints 1 and 2 (output ONLY the translation with no commentary)]:\n${trimmedCustomPrompt}\n\n`
      : '';

    const sourceLabel = hasHiUrMix
      ? `${srcName} (with code-switched Hindi/Urdu phrases)`
      : srcName;

    return (
      `You are an expert multilingual consecutive/simultaneous interpreter.${domainHint}\n` +
      culturalContextLine +
      `Translate ONLY the [Text to Translate] from ${sourceLabel} into fluent, natural, and accurate ${targetName}.\n` +
      'STRICT CONSTRAINTS:\n' +
      '1. Return ONLY the direct translation of [Text to Translate].\n' +
      '2. Do not include quotes, explanations, language labels, prefixes, or notes.\n' +
      constraint3And4 +
      longFormInstruction +
      contextUsageInstruction + '\n' +
      customPromptBlock +
      contextBlock +
      `[Text to Translate]:\n${text}`
    );
  }

  async _executeTranslation({
    text,
    direction,
    category,
    apiKey,
    gasUrl,
    gasToken,
    contextRecords = [],
    customPrompt = '',
    partnerLang = 'en',
    recognitionProfile = 'ja-en-hi-ur',
    hintedLangCode = null
  }) {
    if (!text || text.trim() === '') return { translated: '', speakerLang: 'ja', mixedSubLangs: [], colloquialMix: null };

    const { srcLang, targetLang, langInfo, skipTranslation } = this._resolveLanguagePair(
      text,
      direction,
      partnerLang,
      hintedLangCode,
      recognitionProfile
    );

    if (skipTranslation) {
      this.log('info', `原文と翻訳先が同一言語 (${getLanguageDisplayName(srcLang)}) のため翻訳APIをスキップして確定しました。`);
      return {
        translated: text.trim(),
        speakerLang: srcLang,
        mixedSubLangs: langInfo.mixedSubLangs || [],
        colloquialMix: langInfo.colloquialMix || null,
        skipped: true
      };
    }

    const validContext = Array.isArray(contextRecords)
      ? contextRecords.filter((c) => c && (c.original || c.translated))
      : [];

    const trimmedCustomPrompt = String(customPrompt || '').trim();
    const prompt = this._buildPrompt({
      text,
      direction,
      category,
      srcLang,
      targetLang,
      langInfo,
      recognitionProfile,
      validContext,
      customPrompt: trimmedCustomPrompt
    });

    // Layer 1: Shared Gemini REST Client
    if (apiKey && apiKey.trim() !== '') {
      try {
        const res = await this.textClient.generateText({
          apiKey,
          prompt,
          temperature: 0.15,
          maxOutputTokens: 2048,
          timeoutMs: 20000,
          logTag: 'Translation'
        });
        const ctxNote = validContext.length > 0 ? ` / 文脈${validContext.length}件参照` : '';
        const mixNote = (langInfo.mixedSubLangs?.length || langInfo.colloquialMix) ? ' / 混在補完' : '';
        const customNote = trimmedCustomPrompt ? ' / 追記プロンプト適用' : '';
        this.log(
          'success',
          `Gemini (${res.model}) 翻訳完了 [${srcLang.toUpperCase()}➔${targetLang.toUpperCase()}] (${text.length}文字 ➔ ${res.text.length}文字${ctxNote}${mixNote}${customNote})`
        );
        return {
          translated: res.text,
          speakerLang: srcLang,
          mixedSubLangs: langInfo.mixedSubLangs || [],
          colloquialMix: langInfo.colloquialMix || null
        };
      } catch (err) {
        this.log('warn', `Gemini 翻訳全モデル失敗 (${err.message})`);
      }
    } else {
      this.log('warn', 'Gemini APIキーが未入力のため、GASバックアップ翻訳を試行します。');
    }

    // Layer 2: GAS Web App (LanguageApp) Fallback
    if (gasUrl && gasUrl.trim() !== '') {
      this.log('info', 'GAS (LanguageApp) による自動フォールバック翻訳を実行中...');
      const hasMix = (langInfo.mixedSubLangs && langInfo.mixedSubLangs.length > 0) || Boolean(langInfo.colloquialMix);
      try {
        const gasRes = await fetchWithTimeout(gasUrl.trim(), {
          method: 'POST',
          mode: 'cors',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            action: 'translate',
            token: gasToken || '',
            text,
            srcLang: hasMix ? 'auto' : srcLang,
            targetLang
          })
        }, 20000);

        if (gasRes.ok) {
          const gasData = await gasRes.json();
          if (gasData.status === 'success' && gasData.translated) {
            this.log('success', `GAS翻訳完了: "${gasData.translated}"`);
            return {
              translated: gasData.translated.trim(),
              speakerLang: srcLang,
              mixedSubLangs: langInfo.mixedSubLangs || [],
              colloquialMix: langInfo.colloquialMix || null
            };
          }
          if (gasData.message) this.log('warn', `GAS翻訳応答エラー: ${gasData.message}`);
        } else {
          this.log('warn', `GAS翻訳通信エラー: HTTP ${gasRes.status}`);
        }
      } catch (gasErr) {
        const gasReason = gasErr.name === 'AbortError' ? 'タイムアウト (20秒)' : gasErr.message;
        this.log('warn', `GAS翻訳接続失敗: ${gasReason}`);
      }
    }

    return {
      translated: '【翻訳取得失敗: APIキーまたはGAS設定を確認してください】',
      speakerLang: srcLang,
      mixedSubLangs: langInfo.mixedSubLangs || [],
      colloquialMix: langInfo.colloquialMix || null
    };
  }
}

// ==========================================
// 8. Summary Service (On-Demand Lookback Japanese Summarizer)
// ==========================================
class SummaryService {
  constructor(geminiTextClient) {
    this.textClient = geminiTextClient;
    this.onLogCallback = null;
  }

  log(type, message) {
    if (this.onLogCallback) {
      this.onLogCallback(type, `[Summary] ${message}`);
    }
  }

  async generateSummary({ records, pendingText, rangeLabel, category, customPrompt, apiKey }) {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('サマリー生成には Gemini API キーが必要です。設定画面から登録してください。');
    }

    const lines = [];
    if (Array.isArray(records)) {
      for (const r of records) {
        const timeStr = r.time || '--:--:--';
        const spk = r.speaker || '発話';
        const langTag = formatDocLanguageLabel(r.speakerLang, r.mixedSubLangs, r.colloquialMix);
        const orig = String(r.originalText || '').trim();
        const hasValidTrans =
          !r.isTranslating &&
          r.translatedText &&
          r.translatedText.trim() !== '' &&
          !r.translatedText.startsWith('【翻訳');
        const trans = hasValidTrans ? r.translatedText.trim() : '';

        if (orig || trans) {
          let entry = `[${timeStr}] (${spk} / ${langTag})`;
          if (trans && orig && trans !== orig) {
            entry += `\n  訳文: ${trans}\n  原文: ${orig}`;
          } else {
            entry += `\n  内容: ${trans || orig}`;
          }
          lines.push(entry);
        }
      }
    }

    const cleanPending = String(pendingText || '').trim();
    if (cleanPending) {
      lines.push(`[現在発話中・未確定]\n  原文: ${cleanPending}`);
    }

    if (lines.length === 0) {
      throw new Error('指定された範囲にサマリー対象の発話がありません。');
    }

    let transcriptText = lines.join('\n\n');
    const MAX_INPUT_CHARS = 24000;
    if (transcriptText.length > MAX_INPUT_CHARS) {
      transcriptText = '…(古い一部発話を省略)…\n\n' + transcriptText.slice(-MAX_INPUT_CHARS);
    }

    let domainHint = '対象分野: 一般ビジネス会議・国際打ち合わせ。専門用語や固有名詞・略称は正確に保持してください。';
    if (category === 'Casual') {
      domainHint = '対象分野: 一般会議・ビジネス雑談・日常対話。英語の雑談中に混じるヒンディー語やウルドゥー語等の発言意図も含めて自然に整理してください。';
    } else if (category && category !== 'Common') {
      domainHint = `対象分野: 海事・シップリサイクル / 安全衛生監査 (${category})。専門用語や条約・規則の略称（HKC, EU-SRR, IHM, SRFP, SOC, HSE等）は正確に保持してください。`;
    }

    const customThemeHint = String(customPrompt || '').trim()
      ? `\n【ユーザー指定のテーマ・ニュアンス方針】\n${String(customPrompt).trim()}\n`
      : '';

    const prompt =
      'あなたは多言語会議・現地監査・国際コミュニケーションに精通した優秀な議事録作成・要約アシスタントです。\n' +
      `${domainHint}\n` +
      `以下の多言語会話ログ（対象範囲: ${rangeLabel}）を読み、日本語で簡潔かつ実務にすぐ使える構造化サマリーを作成してください。\n` +
      customThemeHint +
      '\n【出力ルール】\n' +
      '1. 必ず以下のMarkdown見出し構成で日本語出力すること（該当内容が全く無い見出しは省略可）：\n' +
      '### 要点サマリー\n' +
      '（この時間帯の議論の結論・全体の流れを2〜4文で簡潔にまとめる）\n\n' +
      '### 主なトピック・発言内容\n' +
      '- 重要な発言・説明・質疑応答を話者や論点ごとに箇条書きで整理（具体名・数値・条件があれば落とさない）\n\n' +
      '### 確認事項・合意・今後のアクション / 課題\n' +
      '- 決定事項、宿題、懸念点、未解決の課題があれば箇条書きで整理\n\n' +
      '2. ログに含まれていない事実・数値・結論を推測や創作で補わないこと。\n' +
      '3. 多言語発話や英語に混じるヒンディー語・ウルドゥー語等のコードスイッチング、および音声認識の軽微な誤字・言い直しは前後文脈から自然に補正して日本語でまとめること。\n' +
      '4. 前置き（「以下がサマリーです」等）や締めの挨拶は書かず、最初の「### 要点サマリー」から直接出力すること。\n\n' +
      `【会話ログ（時系列順）】\n${transcriptText}`;

    const res = await this.textClient.generateText({
      apiKey,
      prompt,
      temperature: 0.2,
      maxOutputTokens: 2048,
      timeoutMs: 30000,
      logTag: 'Summary'
    });

    this.log('success', `Gemini (${res.model}) サマリー生成完了 (${rangeLabel} / ${lines.length}件)`);
    return { summary: res.text, model: res.model };
  }
}

// ==========================================
// 9. GAS Storage Client (Google Docs Integration)
// ==========================================
class GasStorageClient {
  static extractFolderId(input) {
    if (!input) return '';
    const match = String(input).trim().match(/\/folders\/([a-zA-Z0-9_-]+)/);
    return match?.[1] || String(input).trim();
  }

  static extractDocId(input) {
    if (!input) return '';
    const match = String(input).trim().match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    return match?.[1] || String(input).trim();
  }

  static _validateGasUrl(gasUrl) {
    if (!gasUrl) throw new Error('GAS Web App URLが設定されていません。');
    const trimmedUrl = gasUrl.trim();
    if (!trimmedUrl.startsWith('https://script.google.com/')) {
      throw new Error('GAS Web App URLは "https://script.google.com/..." で始まる必要があります。');
    }
    if (trimmedUrl.endsWith('/edit')) {
      throw new Error('GASエディタの編集URLが設定されています。「デプロイ」→「ウェブアプリ」で発行されたURL (.../exec) を設定してください。');
    }
    return trimmedUrl;
  }

  static _parseGasJson(rawText) {
    try {
      return JSON.parse(rawText);
    } catch (jsonErr) {
      if (rawText.includes('<html') || rawText.includes('<!DOCTYPE') || rawText.includes('accounts.google.com')) {
        throw new Error('Googleのログイン画面が返却されました。GASのデプロイ設定で「アクセスできるユーザー」を「全員 (Anyone)」に設定してください。');
      }
      throw new Error(`GAS応答の解析失敗: ${rawText.slice(0, 100)}`);
    }
  }

  static async ping(gasUrl, token) {
    const trimmedUrl = GasStorageClient._validateGasUrl(gasUrl);
    try {
      const res = await fetchWithTimeout(trimmedUrl, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'ping', token: token || '' })
      }, 12000);

      const data = GasStorageClient._parseGasJson(await res.text());
      if (data.status === 'error') {
        throw new Error(data.message || 'GASエラー');
      }
      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('GASサーバーが12秒以内に応答しませんでした（タイムアウト）。URLとデプロイ状態を確認してください。');
      }
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        throw new Error('GASサーバーに接続できません (CORS/ネットワークエラー)。デプロイ設定で「アクセスできるユーザー: 全員」になっているか確認してください。');
      }
      throw err;
    }
  }

  static async saveTranscript(
    gasUrl,
    { documentId, title, folderId, records, summary, direction, partnerLang, recognitionProfile, category, model, token, saveMode = 'sync' }
  ) {
    const trimmedUrl = GasStorageClient._validateGasUrl(gasUrl);
    if (!records || records.length === 0) throw new Error('保存対象の確定翻訳レコードがありません。');

    const extractedFolderId = GasStorageClient.extractFolderId(folderId);
    const payload = {
      action: 'save',
      token: token || '',
      documentId: GasStorageClient.extractDocId(documentId),
      title: title || '',
      folderId: extractedFolderId,
      outputFolderId: extractedFolderId,
      model: model || DEFAULT_SETTINGS.DEFAULT_LIVE_MODEL,
      direction: direction || 'auto',
      partnerLang: partnerLang || 'en',
      recognitionProfile: recognitionProfile || DEFAULT_SETTINGS.DEFAULT_RECOGNITION_PROFILE,
      category: category || DEFAULT_SETTINGS.DEFAULT_CATEGORY,
      saveMode,
      records
    };
    if (summary && summary.markdown) {
      payload.summary = summary;
    }

    let res;
    try {
      res = await fetchWithTimeout(trimmedUrl, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      }, 40000);
    } catch (netErr) {
      if (netErr.name === 'AbortError') {
        throw new Error('GAS保存が40秒以内に完了しませんでした（タイムアウト）。通信環境またはGoogle Apps Scriptの実行状況を確認してください。');
      }
      throw new Error('GASサーバーと通信できませんでした (CORSまたは接続遮断)。GASのデプロイで「アクセスできるユーザー: 全員」が設定されているか確認してください。');
    }

    if (!res.ok) {
      throw new Error(`GAS通信HTTPエラー: ${res.status}`);
    }

    const data = GasStorageClient._parseGasJson(await res.text());
    if (data.status === 'error') {
      const err = new Error(data.message || 'GAS処理エラー');
      err.code = data.code;
      throw err;
    }
    return data;
  }
}

// ==========================================
// 10. LongFormUtteranceBuffer (Code-Switch-Safe & Multilingual Punctuation Aggregator)
// ==========================================
class LongFormUtteranceBuffer {
  static PRESETS = Object.freeze({
    'long': {
      ja: { silenceMs: 4000, minCharsForSentenceEnd: 260, hardMaxChars: 520, maxWaitMs: 28000 },
      other: { silenceMs: 2000, minCharsForSentenceEnd: 85, hardMaxChars: 220, maxWaitMs: 15000 }
    },
    'extra-long': {
      ja: { silenceMs: 6000, minCharsForSentenceEnd: 420, hardMaxChars: 800, maxWaitMs: 45000 },
      other: { silenceMs: 2800, minCharsForSentenceEnd: 135, hardMaxChars: 320, maxWaitMs: 20000 }
    },
    'balanced': {
      ja: { silenceMs: 2200, minCharsForSentenceEnd: 120, hardMaxChars: 280, maxWaitMs: 16000 },
      other: { silenceMs: 1500, minCharsForSentenceEnd: 50, hardMaxChars: 160, maxWaitMs: 12000 }
    }
  });

  constructor({ onFlush, onDisplayUpdate, onLog } = {}) {
    this.onFlush = onFlush || null;
    this.onDisplayUpdate = onDisplayUpdate || null;
    this.onLog = onLog || null;

    this.mode = 'long';
    this.direction = 'auto';
    this.partnerLang = 'en';
    this.recognitionProfile = DEFAULT_SETTINGS.DEFAULT_RECOGNITION_PROFILE;

    this.committedText = '';
    this.currentInterim = '';
    this.bufferLangHint = null;
    this.bufferPrimaryLang = null;
    this.bufferTargetLang = 'ja';
    this.bufferSkipTranslation = false;
    this._afterTurnComplete = false;

    this.silenceTimer = null;
    this.maxWaitTimer = null;
  }

  setConfig({ mode, direction, partnerLang, recognitionProfile } = {}) {
    if (mode && LongFormUtteranceBuffer.PRESETS[mode]) {
      this.mode = mode;
    }
    if (direction !== undefined) {
      this.direction = direction;
    }
    if (partnerLang !== undefined) {
      this.partnerLang = normalizeLangCode(partnerLang) || 'en';
    }
    if (recognitionProfile !== undefined && RECOGNITION_PROFILES[recognitionProfile]) {
      this.recognitionProfile = recognitionProfile;
    }
    if (!this.hasPendingText()) {
      const isJaSourceFixed = this.direction === 'ja-to-partner' || this.direction === 'ja-to-en';
      this.bufferTargetLang = isJaSourceFixed
        ? (this.direction === 'ja-to-en' ? 'en' : this.partnerLang)
        : (this.direction === 'all-to-partner' ? this.partnerLang : 'ja');
      this.bufferSkipTranslation = false;
    }
    this._notifyDisplay();
  }

  hasPendingText() {
    return (this.committedText + this.currentInterim).trim().length > 0;
  }

  getPendingText() {
    const committed = this.committedText.trim();
    const interim = this.currentInterim.trim();
    if (committed && interim) return `${committed} ${interim}`;
    return committed || interim || '';
  }

  reset() {
    this._clearTimers();
    this.committedText = '';
    this.currentInterim = '';
    this.bufferLangHint = null;
    this.bufferPrimaryLang = null;
    const isJaSourceFixed = this.direction === 'ja-to-partner' || this.direction === 'ja-to-en';
    this.bufferTargetLang = isJaSourceFixed
      ? (this.direction === 'ja-to-en' ? 'en' : this.partnerLang)
      : (this.direction === 'all-to-partner' ? this.partnerLang : 'ja');
    this.bufferSkipTranslation = false;
    this._afterTurnComplete = false;
    this._notifyDisplay();
  }

  markTurnComplete() {
    this._afterTurnComplete = true;
  }

  _clearTimers() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.maxWaitTimer) {
      clearTimeout(this.maxWaitTimer);
      this.maxWaitTimer = null;
    }
  }

  _getPresetConfig(targetLang) {
    const preset = LongFormUtteranceBuffer.PRESETS[this.mode] || LongFormUtteranceBuffer.PRESETS.long;
    return targetLang === 'ja' ? preset.ja : preset.other;
  }

  _resolveRoute(text, langCode) {
    return resolveTranslationRoute(text, this.direction, this.partnerLang, langCode, this.recognitionProfile);
  }

  /**
   * 話者交代に伴う言語グループ切替判定
   * 重要: 英語雑談中にヒンディー語・ウルドゥー語等が混ざるケース（ともに targetLang === 'ja' かつ skipTranslation === false）は
   * 分断せず1つの長文チャンクに保持し、日本語話者 ⇄ 外国語話者 の交代時のみ即座にフラッシュ分離する。
   */
  _isClearLanguageGroupSwitch(incomingText, langCode) {
    if (!this.committedText.trim()) return false;
    if (this.direction === 'en-to-ja' || this.direction === 'ja-to-partner' || this.direction === 'ja-to-en') {
      return false;
    }

    const clean = incomingText.trim();
    if (!clean) return false;

    const incomingRoute = this._resolveRoute(clean, langCode);
    const routeChanged =
      incomingRoute.targetLang !== this.bufferTargetLang ||
      incomingRoute.skipTranslation !== this.bufferSkipTranslation;

    if (!routeChanged) return false;

    const kanaCount = (clean.match(/[\u3040-\u309F\u30A0-\u30FF\uFF66-\uFF9F]/g) || []).length;
    const nonJaForeignScriptCount = (
      clean.match(/[\u0900-\u097F\u0980-\u09FF\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF\uAC00-\uD7AF\u0E00-\u0E7F\u1000-\u109F\u0400-\u04FF]/g) || []
    ).length;
    const latinWords = clean.match(/[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]{2,}/g) || [];
    const latinLetters = (clean.match(/[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/g) || []).length;

    // 外国語バッファ蓄積中に日本語話者が話し始めた場合
    if (incomingRoute.langInfo.primaryLang === 'ja') {
      if (kanaCount >= 2) return true;
      if (normalizeLangCode(langCode) === 'ja' && /[\u3400-\u9FFF]/.test(clean) && clean.length >= 2) return true;
      return false;
    }

    // 日本語バッファ蓄積中に外国語話者が話し始めた場合（"HKC" 等の短い英語略語1語では分割しない）
    if (this.bufferPrimaryLang === 'ja') {
      if (nonJaForeignScriptCount >= 2) return true;
      if (CHINESE_SIMPLIFIED_MARKERS_REGEX.test(clean) && clean.length >= 2) return true;
      return kanaCount === 0 && (latinWords.length >= 3 || latinLetters >= 16);
    }

    // all-to-partner 等で相手言語と第3言語が切り替わった場合
    return nonJaForeignScriptCount >= 2 || latinWords.length >= 3;
  }

  _charScriptBucket(ch) {
    if (!ch) return 'other';
    if (/[\u3000-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(ch)) return 'cjk';
    if (/[\u0E00-\u0E7F\u1000-\u109F]/.test(ch)) return 'thai-my';
    if (/[A-Za-z0-9\u00C0-\u024F\u1E00-\u1EFF]/.test(ch)) return 'latin';
    if (/[\u0900-\u097F]/.test(ch)) return 'devanagari';
    if (/[\u0980-\u09FF]/.test(ch)) return 'bengali';
    if (/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(ch)) return 'perso-arabic';
    if (/[\uAC00-\uD7AF]/.test(ch)) return 'hangul';
    if (/[\u0400-\u04FF]/.test(ch)) return 'cyrillic';
    return 'other';
  }

  _joinText(base, addition, forceSpaceIfNonCJK = false) {
    if (!addition) return base;
    if (!base) return addition.replace(/^\s+/, '');

    const trimmedBase = base.trim();
    const trimmedAdd = addition.trim();
    if (trimmedBase.length >= 6 && trimmedAdd.startsWith(trimmedBase)) {
      return trimmedAdd;
    }

    if (/^\s/.test(addition) || /\s$/.test(base)) {
      return (base + addition).replace(/[ \t]{2,}/g, ' ');
    }

    const lastChar = base.slice(-1);
    const firstChar = addition.charAt(0);
    const lastBucket = this._charScriptBucket(lastChar);
    const firstBucket = this._charScriptBucket(firstChar);

    const startsWithClosingPunct = /^[.,?!;:)\]'""’”）。、，！？\u0964\u0965\u06D4\u061F\u060C\u061B]/.test(firstChar);
    if (startsWithClosingPunct) {
      return base + addition;
    }

    if (
      (lastBucket === 'cjk' && firstBucket === 'cjk') ||
      (lastBucket === 'thai-my' && firstBucket === 'thai-my')
    ) {
      return base + addition;
    }

    const endsWithPunct = /[.?!,;:\u0964\u0965\u06D4\u061F\u060C\u061B]$/.test(lastChar);
    // 異なる文字スクリプト間（例: 英語ラテン文字 ⇄ ウルドゥー文字／デーヴァナーガリー文字）は必ず空白を補う
    const crossSpaceScriptSwitch =
      lastBucket !== 'other' &&
      firstBucket !== 'other' &&
      lastBucket !== firstBucket &&
      !(lastBucket === 'cjk' || firstBucket === 'cjk');

    if (endsWithPunct || forceSpaceIfNonCJK || crossSpaceScriptSwitch) {
      return base + ' ' + addition;
    }
    return base + addition;
  }

  pushInterim(interimText) {
    this.currentInterim = String(interimText || '');
    if (this.hasPendingText()) {
      this._scheduleSilenceTimer();
    }
    this._notifyDisplay();
  }

  pushFinal(rawText, langCode = null, options = {}) {
    if (typeof rawText !== 'string' || rawText.length === 0) return;

    if (this._isClearLanguageGroupSwitch(rawText, langCode)) {
      this._emitText(this.committedText, this.bufferLangHint, 'language-switch');
      this.committedText = '';
      this.bufferLangHint = null;
      this.bufferPrimaryLang = null;
      this._clearTimers();
    }

    const wasEmpty = this.committedText.trim().length === 0;
    const forceSpace = !!options.fromWebSpeech || this._afterTurnComplete;
    this._afterTurnComplete = false;

    this.currentInterim = '';
    this.committedText = this._joinText(this.committedText, rawText, forceSpace);

    if (wasEmpty && this.committedText.trim().length > 0) {
      const route = this._resolveRoute(this.committedText, langCode);
      this.bufferLangHint = langCode || route.srcLang;
      this.bufferPrimaryLang = route.langInfo.primaryLang;
      this.bufferTargetLang = route.targetLang;
      this.bufferSkipTranslation = route.skipTranslation;
      this._scheduleMaxWaitTimer();
    } else if (!this.bufferLangHint && langCode) {
      this.bufferLangHint = langCode;
    }

    this._tryEmitReadyChunks();

    if (this.committedText.trim().length > 0) {
      this._scheduleSilenceTimer();
      if (!this.maxWaitTimer) {
        this._scheduleMaxWaitTimer();
      }
    } else {
      this._clearTimers();
    }

    this._notifyDisplay();
  }

  _tryEmitReadyChunks() {
    const cfg = this._getPresetConfig(this.bufferTargetLang);

    while (this.committedText.trim().length >= cfg.minCharsForSentenceEnd) {
      const text = this.committedText.trim();
      const minSplit = Math.floor(cfg.minCharsForSentenceEnd * 0.55);

      let splitIdx = this._findSplitIndex(text, minSplit, text.length, true);
      if (splitIdx <= 0 && text.length >= cfg.hardMaxChars) {
        splitIdx = this._findSplitIndex(text, Math.floor(cfg.hardMaxChars * 0.5), cfg.hardMaxChars, false);
      }
      if (splitIdx <= 0) break;

      const chunk = text.slice(0, splitIdx).trim();
      const remainder = text.slice(splitIdx).trim();
      if (!chunk) break;

      this._emitText(chunk, this.bufferLangHint, 'length-boundary');
      this.committedText = remainder;

      if (!remainder) {
        this.bufferLangHint = null;
        this.bufferPrimaryLang = null;
        this._clearTimers();
        break;
      }

      const nextRoute = this._resolveRoute(remainder, null);
      this.bufferLangHint = nextRoute.srcLang;
      this.bufferPrimaryLang = nextRoute.langInfo.primaryLang;
      this.bufferTargetLang = nextRoute.targetLang;
      this.bufferSkipTranslation = nextRoute.skipTranslation;
      if (this.maxWaitTimer) {
        clearTimeout(this.maxWaitTimer);
        this.maxWaitTimer = null;
      }
      this._scheduleMaxWaitTimer();
    }
  }

  _findSplitIndex(text, minIdx, maxIdx, sentenceOnly) {
    const slice = text.slice(0, Math.min(text.length, maxIdx));

    // 欧文 (.?!)、日中 (。！？)、デーヴァナーガリー (।॥)、ウルドゥー/アラビア文字 (۔؟) の文末記号に対応
    const sentenceRegex = /([.?!](?=\s|$)|[。！？\u0964\u0965\u06D4\u061F])/g;
    let lastSentenceEnd = -1;
    let m;
    while ((m = sentenceRegex.exec(slice)) !== null) {
      const endPos = m.index + m[0].length;
      if (endPos >= minIdx) lastSentenceEnd = endPos;
    }
    if (lastSentenceEnd !== -1) return lastSentenceEnd;
    if (sentenceOnly) return -1;

    // 節区切り（欧文 ,;: / 日中 、，：； / ウルドゥー・アラビア ،؛）
    const clauseRegex = /([,;:](?=\s|$)|[、，：；\u060C\u061B])/g;
    let lastClauseEnd = -1;
    while ((m = clauseRegex.exec(slice)) !== null) {
      const endPos = m.index + m[0].length;
      if (endPos >= minIdx) lastClauseEnd = endPos;
    }
    if (lastClauseEnd !== -1) return lastClauseEnd;

    const lastSpace = slice.lastIndexOf(' ');
    if (lastSpace >= minIdx) return lastSpace;

    return Math.min(text.length, maxIdx);
  }

  _scheduleSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    const cfg = this._getPresetConfig(this.bufferTargetLang);
    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = null;
      if (this.hasPendingText()) {
        this.flushAll('silence-timeout');
      }
    }, cfg.silenceMs);
  }

  _scheduleMaxWaitTimer() {
    if (this.maxWaitTimer) {
      clearTimeout(this.maxWaitTimer);
      this.maxWaitTimer = null;
    }
    const cfg = this._getPresetConfig(this.bufferTargetLang);
    this.maxWaitTimer = setTimeout(() => {
      this.maxWaitTimer = null;
      const text = this.committedText.trim();
      if (text.length < 80) {
        if (text.length > 0) this._scheduleMaxWaitTimer();
        return;
      }
      const splitIdx = this._findSplitIndex(text, Math.floor(text.length * 0.45), text.length, false);
      const chunk = text.slice(0, splitIdx).trim();
      const remainder = text.slice(splitIdx).trim();
      if (chunk) {
        this._emitText(chunk, this.bufferLangHint, 'max-wait');
        this.committedText = remainder;
        if (!remainder) {
          this.bufferLangHint = null;
          this.bufferPrimaryLang = null;
          this._clearTimers();
        } else {
          this._scheduleMaxWaitTimer();
          this._scheduleSilenceTimer();
        }
        this._notifyDisplay();
      }
    }, cfg.maxWaitMs);
  }

  flushAll(reason = 'manual') {
    this._clearTimers();
    let combined = this.committedText;
    if (this.currentInterim && this.currentInterim.trim().length > 0) {
      combined = this._joinText(combined, this.currentInterim.trim(), true);
    }
    const finalChunk = combined.trim();
    const langHint = this.bufferLangHint || (finalChunk ? detectLanguage(finalChunk, null, this.recognitionProfile) : null);

    this.committedText = '';
    this.currentInterim = '';
    this.bufferLangHint = null;
    this.bufferPrimaryLang = null;
    this._afterTurnComplete = false;

    if (finalChunk.length > 0) {
      this._emitText(finalChunk, langHint, reason);
    }
    this._notifyDisplay();
  }

  _emitText(text, langHint, reason) {
    if (!text || !text.trim()) return;
    if (this.onLog) {
      this.onLog('info', `[長文バッファ確定:${reason}] ${text.trim().length}文字を翻訳キューへ送信`);
    }
    if (this.onFlush) {
      this.onFlush(text.trim(), langHint);
    }
  }

  _notifyDisplay() {
    if (!this.onDisplayUpdate) return;
    const cfg = this._getPresetConfig(this.bufferTargetLang);
    this.onDisplayUpdate({
      committed: this.committedText.trim(),
      interim: this.currentInterim.trim(),
      totalChars: (this.committedText + this.currentInterim).trim().length,
      targetLang: this.bufferTargetLang,
      skipTranslation: this.bufferSkipTranslation,
      silenceSec: (cfg.silenceMs / 1000).toFixed(1)
    });
  }
}

// ==========================================
// 11. Main Application Controller
// ==========================================
class App {
  constructor() {
    this.audioService = new AudioCaptureService();
    this.webSpeechService = new WebSpeechService();
    this.geminiClient = new GeminiLiveClient();
    this.geminiTextClient = new GeminiTextClient();
    this.geminiTextClient.onLogCallback = (type, msg) => this.log(type, msg);

    this.utteranceBuffer = new LongFormUtteranceBuffer({
      onFlush: (chunk, langCode) => this._handleFinalSpeech(chunk, langCode),
      onDisplayUpdate: (state) => this._renderLiveDisplay(state),
      onLog: (type, msg) => this.log(type, msg)
    });

    this.translationService = new TranslationService(this.geminiTextClient);
    this.translationService.onLogCallback = (type, msg) => this.log(type, msg);

    this.summaryService = new SummaryService(this.geminiTextClient);
    this.summaryService.onLogCallback = (type, msg) => this.log(type, msg);

    this.activeEngine = 'none';
    this.records = [];
    this.summaryHistory = [];
    this.currentSummaryId = null;
    this.savedRecordCount = 0;
    this.unsavedFinalizedDelta = 0;

    // State & concurrency locks
    this.hasUnsavedChanges = false;
    this.isRecording = false;
    this.isStarting = false;
    this.isPaused = false;
    this.isSummarizing = false;
    this.isSavingDocs = false;
    this.summaryBodyCollapsed = false;

    // v3.3.0 UX state
    this.unreadNewCount = 0;
    this.timelineQuery = '';
    this.timelineFilter = 'all';
    this._recStartedAt = 0;
    this._recTimerInterval = null;
    this._wakeLockSentinel = null;
    this._scrollRafPending = false;
    this._lastDraftJson = '';
    this._pendingPrevDraft = null;
    this._highlightTimer = null;

    this._initElements();
    this._initCustomLangCheckboxes();
    this._loadSettings();
    this._bindAllEvents();
    this._checkHashConfig();
    this._initSessionDraft();
    this._refreshMicDevices();
    this._updateUIState();

    if (isIPadOrIOS()) {
      this.log('info', '📱 iPadOS / iOS 環境を検出しました。Web Audio 即時アンロック＆最適化マイク設定を適用しました。');
      const displayOption = this.elSelectAudioSource?.querySelector('option[value="display"]');
      if (displayOption) {
        displayOption.disabled = true;
        displayOption.textContent = 'タブ・PC音声 (PCのみ・iPad非対応)';
      }
    }

    this._summaryPreviewTimer = setInterval(() => this._updateSummaryTargetPreview(), 15000);
    this.log(
      'info',
      `初期化完了 (v${APP_VERSION})。日英最優先＋ヒンディー/ウルドゥー雑談補足・85+多言語対応・未保存復元・ミニLIVEバー・ローカル保存・検索フィルタが有効です。`
    );
  }

  log(type, message) {
    if (!this.elDiagLog || !this.elDiagLogContainer) return;
    const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const line = document.createElement('div');
    line.className = `log-line log-${type}`;
    line.textContent = `[${time}] ${message}`;
    this.elDiagLog.appendChild(line);

    // 長時間稼働時のDOM肥大化を防止
    while (this.elDiagLog.childElementCount > DEFAULT_SETTINGS.MAX_LOG_LINES) {
      this.elDiagLog.removeChild(this.elDiagLog.firstElementChild);
    }
    this.elDiagLogContainer.scrollTop = this.elDiagLogContainer.scrollHeight;
  }

  _initElements() {
    const byId = (id) => document.getElementById(id);

    this.elStatusBadge = byId('connection-status');
    this.elStatusText = byId('status-text');
    this.elEngineBadge = byId('active-engine-badge');
    this.elBtnSettings = byId('btn-open-settings');
    this.elRecTimer = byId('rec-timer');
    this.elBtnFontSize = byId('btn-font-size');
    this.elBtnThemeToggle = byId('btn-theme-toggle');

    // Sticky Mini Live Bar & New Items FAB
    this.elMiniLiveBar = byId('mini-live-bar');
    this.elMiniTimer = byId('mini-timer');
    this.elMiniMeterBar = byId('mini-meter-bar');
    this.elMiniLiveText = byId('mini-live-text');
    this.elBtnMiniFlush = byId('btn-mini-flush');
    this.elBtnMiniPause = byId('btn-mini-pause');
    this.elBtnMiniStop = byId('btn-mini-stop');
    this.elBtnMiniTop = byId('btn-mini-top');
    this.elBtnNewItems = byId('btn-new-items');
    this.elNewItemsCount = byId('new-items-count');

    // Draft Restore Banner
    this.elDraftRestoreBanner = byId('draft-restore-banner');
    this.elDraftRestoreText = byId('draft-restore-text');
    this.elBtnDraftRestore = byId('btn-draft-restore');
    this.elBtnDraftDiscard = byId('btn-draft-discard');

    this.elBtnToggleRecord = byId('btn-toggle-record');
    this.elBtnPauseRecord = byId('btn-pause-record');
    this.elSelectRecognitionProfile = byId('select-recognition-profile');
    this.elSelectDirection = byId('select-direction');
    this.elGroupPartnerLang = byId('group-partner-lang');
    this.elSelectPartnerLang = byId('select-partner-lang');
    this.elSelectCategory = byId('select-category');
    this.elSelectChunkMode = byId('select-chunk-mode');
    this.elSelectContextWindow = byId('select-context-window');
    this.elSelectAudioSource = byId('select-audio-source');
    this.elSelectGain = byId('select-gain');
    this.elSelectVadMode = byId('select-vad-mode');
    this.elSelectMicDevice = byId('select-mic-device');
    this.elSelectDefaultGain = byId('select-default-gain');
    this.elBtnClearFeed = byId('btn-clear-feed');
    this.elBtnSaveDocs = byId('btn-save-docs');
    this.elSaveDocsText = byId('btn-save-docs-text');
    this.elUnsavedBadge = byId('unsaved-badge');

    // Custom Langs Inline Strip & Collapsible Advanced Panel
    this.elCustomLangsInline = byId('custom-langs-inline');
    this.elCustomLangsInlineBadges = byId('custom-langs-inline-badges');
    this.elBtnEditCustomLangs = byId('btn-edit-custom-langs');
    this.elBtnToggleAdvanced = byId('btn-toggle-advanced');
    this.elAdvancedSummaryBadge = byId('advanced-summary-badge');
    this.elAdvancedToggleChevron = byId('advanced-toggle-chevron');
    this.elAdvancedPanelBody = byId('advanced-panel-body');

    this.elRadioDocModes = document.getElementsByName('doc-save-mode');
    this.elCheckIncludeSummary = byId('check-include-summary');
    this.elInputDocTitle = byId('input-doc-title');
    this.elInputDocId = byId('input-doc-id');
    this.elInputFolderId = byId('input-folder-id');
    this.elInputDefaultFolderId = byId('input-default-folder-id');
    this.elSavedFolderSep = byId('saved-folder-sep');
    this.elSavedFolderLink = byId('saved-folder-link');
    this.elSavedDocBanner = byId('saved-doc-banner');
    this.elSavedDocLink = byId('saved-doc-link');

    this.elLivePreview = byId('livePreview');
    this.elLiveText = byId('liveText');
    this.elLiveEngineTag = byId('liveEngineTag');
    this.elLiveVadBadge = byId('liveVadBadge');
    this.elLiveBufferStatus = byId('liveBufferStatus');
    this.elBtnFlushNow = byId('btn-flush-now');
    this.elMeterBar = document.querySelector('#audio-meter .meter-bar');

    this.elToggleDiag = byId('toggle-diag');
    this.elDiagToggleIcon = byId('diag-toggle-icon');
    this.elDiagLogContainer = byId('diag-log-container');
    this.elDiagLog = byId('diag-log');

    this.elTranscriptList = byId('transcript-list');
    this.elEmptyState = byId('empty-state');
    this.elOnboardingSetup = byId('onboarding-setup');
    this.elEmptyDefault = byId('empty-default');
    this.elBtnOnboardSettings = byId('btn-onboard-settings');
    this.elRecordCount = byId('record-count');
    this.elBtnCopyAll = byId('btn-copy-all');
    this.elExportMenu = byId('export-menu');
    this.elBtnExportToggle = byId('btn-export-toggle');
    this.elExportItems = document.querySelectorAll('.export-item[data-export]');
    this.elInputTimelineSearch = byId('input-timeline-search');
    this.elSelectTimelineFilter = byId('select-timeline-filter');
    this.elTimelineFilterCount = byId('timeline-filter-count');
    this.elFilterEmpty = byId('filter-empty');

    // Custom Prompt Panel
    this.elBtnTogglePromptPanel = byId('btn-toggle-prompt-panel');
    this.elPromptPanelBody = byId('prompt-panel-body');
    this.elPromptStatusBadge = byId('prompt-status-badge');
    this.elPromptToggleChevron = byId('prompt-toggle-chevron');
    this.elInputTranslationPrompt = byId('input-translation-prompt');
    this.elBtnClearTranslationPrompt = byId('btn-clear-translation-prompt');
    this.elPromptPresetBtns = document.querySelectorAll('.prompt-preset-btn');

    // Summary UI
    this.elSelectSummaryRange = byId('select-summary-range');
    this.elSummaryCustomWrapper = byId('summary-custom-wrapper');
    this.elInputSummaryCustomMin = byId('input-summary-custom-min');
    this.elSummaryTargetPreview = byId('summary-target-preview');
    this.elBtnGenerateSummary = byId('btn-generate-summary');
    this.elSummaryResultCard = byId('summary-result-card');
    this.elSummaryMetaBadge = byId('summary-meta-badge');
    this.elSelectSummaryHistory = byId('select-summary-history');
    this.elBtnCopySummary = byId('btn-copy-summary');
    this.elBtnToggleSummaryBody = byId('btn-toggle-summary-body');
    this.elBtnCloseSummary = byId('btn-close-summary');
    this.elSummaryResultBody = byId('summary-result-body');
    this.elSummaryContent = byId('summary-content');

    // Settings Modal
    this.elModal = byId('settings-modal');
    this.elBtnCloseModal = byId('btn-close-modal');
    this.elInputApiKey = byId('input-gemini-key');
    this.elBtnToggleKeyVis = byId('btn-toggle-key-vis');
    this.elSelectEngineMode = byId('select-engine-mode');
    this.elSelectLiveModel = byId('select-live-model');
    this.elCustomLangsGrid = byId('custom-langs-grid');
    this.elCustomLangPresetBtns = document.querySelectorAll('.custom-lang-preset-btn');
    this.elInputSystemInstruction = byId('input-system-instruction');
    this.elBtnResetInstruction = byId('btn-reset-instruction');
    this.elInputGasUrl = byId('input-gas-url');
    this.elInputGasToken = byId('input-gas-token');
    this.elBtnTestGas = byId('btn-test-gas');
    this.elGasTestResult = byId('gas-test-result');
    this.elCheckAutoSave = byId('check-auto-save');
    this.elBtnSaveSettings = byId('btn-save-settings');

    this.elToastContainer = byId('toast-container');

    // QR Code Modal
    this.elBtnOpenQr = byId('btn-open-qr');
    this.elQrModal = byId('qr-modal');
    this.elBtnCloseQrModal = byId('btn-close-qr-modal');
    this.elBtnDoneQrModal = byId('btn-done-qr-modal');
    this.elQrCanvas = byId('qr-canvas');
    this.elQrDensityMeta = byId('qr-density-meta');
    this.elCheckQrIncludePrompts = byId('check-qr-include-prompts');
    this.elInputShareUrl = byId('input-share-url');
    this.elBtnCopyShareUrl = byId('btn-copy-share-url');
  }

  _initCustomLangCheckboxes() {
    if (!this.elCustomLangsGrid) return;
    this.elCustomLangsGrid.innerHTML = '';
    for (const [code, meta] of Object.entries(LANGUAGE_REGISTRY)) {
      const label = document.createElement('label');
      label.className = 'custom-lang-chip';
      label.title = `${meta.name} (${meta.englishName})`;
      label.innerHTML = `<input type="checkbox" value="${this._escapeHTML(code)}"><span>${meta.badge} ${this._escapeHTML(meta.name)}</span>`;
      this.elCustomLangsGrid.appendChild(label);
    }
  }

  _syncCustomLangCheckboxesUI() {
    if (!this.elCustomLangsGrid) return;
    const selectedSet = new Set(this.customLangs || DEFAULT_SETTINGS.DEFAULT_CUSTOM_LANGS);
    const inputs = this.elCustomLangsGrid.querySelectorAll('input[type="checkbox"]');
    inputs.forEach((chk) => {
      chk.checked = selectedSet.has(chk.value);
    });
  }

  _readCustomLangCheckboxes() {
    if (!this.elCustomLangsGrid) return [...DEFAULT_SETTINGS.DEFAULT_CUSTOM_LANGS];
    const checked = Array.from(this.elCustomLangsGrid.querySelectorAll('input[type="checkbox"]:checked'))
      .map((chk) => normalizeLangCode(chk.value))
      .filter(Boolean);
    return checked.length > 0 ? checked : ['ja', 'en'];
  }

  _loadSettings() {
    const K = ConfigManager.STORAGE_KEYS;
    this.apiKey = ConfigManager.get(K.API_KEY, '');
    this.gasUrl = ConfigManager.get(K.GAS_URL, '');
    this.gasToken = ConfigManager.get(K.GAS_TOKEN, '');
    this.audioSource = ConfigManager.get(K.AUDIO_SOURCE, 'mic');

    const savedProfile = ConfigManager.get(K.RECOGNITION_PROFILE, DEFAULT_SETTINGS.DEFAULT_RECOGNITION_PROFILE);
    this.recognitionProfile = RECOGNITION_PROFILES[savedProfile]
      ? savedProfile
      : DEFAULT_SETTINGS.DEFAULT_RECOGNITION_PROFILE;

    let rawDirection = ConfigManager.get(K.DIRECTION, 'auto');
    let savedPartner = normalizeLangCode(ConfigManager.get(K.PARTNER_LANG, DEFAULT_SETTINGS.DEFAULT_PARTNER_LANG)) || 'en';
    if (!LANGUAGE_REGISTRY[savedPartner]) savedPartner = 'en';

    // 旧バージョン 'ja-to-en' 保存値とのシームレス互換
    if (rawDirection === 'ja-to-en') {
      rawDirection = 'ja-to-partner';
      if (!ConfigManager.get(K.PARTNER_LANG, '')) savedPartner = 'en';
    }
    const validDirections = new Set(['auto', 'all-to-ja', 'all-to-partner', 'ja-to-partner', 'en-to-ja']);
    this.direction = validDirections.has(rawDirection) ? rawDirection : 'auto';
    this.partnerLang = savedPartner;

    const rawCustomStr = ConfigManager.get(K.CUSTOM_LANGS, DEFAULT_SETTINGS.DEFAULT_CUSTOM_LANGS.join(','));
    const parsedCustom = String(rawCustomStr || '')
      .split(',')
      .map((s) => normalizeLangCode(s))
      .filter((c) => c && LANGUAGE_REGISTRY[c]);
    this.customLangs = parsedCustom.length > 0 ? parsedCustom : [...DEFAULT_SETTINGS.DEFAULT_CUSTOM_LANGS];

    const validCategories = new Set(['Common', 'Casual', 'HKC', 'EU-SRR', 'HSE', 'IHM']);
    const savedCategory = ConfigManager.get(K.CATEGORY, DEFAULT_SETTINGS.DEFAULT_CATEGORY);
    this.category = validCategories.has(savedCategory) ? savedCategory : DEFAULT_SETTINGS.DEFAULT_CATEGORY;

    this.chunkMode = ConfigManager.get(K.CHUNK_MODE, 'long');

    const savedCtxWin = parseInt(ConfigManager.get(K.CONTEXT_WINDOW, '6'), 10);
    this.contextWindow = isNaN(savedCtxWin) ? 6 : savedCtxWin;

    this.translationCustomPrompt = ConfigManager.get(K.TRANSLATION_CUSTOM_PROMPT, '');
    this.promptPanelOpen = ConfigManager.get(K.TRANSLATION_PROMPT_OPEN, 'false') === 'true';
    this.advancedPanelOpen = ConfigManager.get(K.ADVANCED_OPEN, 'false') === 'true';

    this.summaryRange = ConfigManager.get(K.SUMMARY_RANGE, '5');
    const savedCustomMin = parseInt(ConfigManager.get(K.SUMMARY_CUSTOM_MIN, '5'), 10);
    this.summaryCustomMin = (!isNaN(savedCustomMin) && savedCustomMin >= 1 && savedCustomMin <= 360) ? savedCustomMin : 5;

    this.gain = ConfigManager.get(K.GAIN, '2.5');
    this.vadMode = ConfigManager.get(K.VAD_MODE, 'auto');
    if (!VoiceActivityDetector.PRESETS[this.vadMode]) this.vadMode = 'auto';
    this.micDeviceId = ConfigManager.get(K.MIC_DEVICE_ID, '');
    this.engineMode = ConfigManager.get(K.ENGINE_MODE, 'auto');
    this.liveModel = ConfigManager.get(K.LIVE_MODEL, DEFAULT_SETTINGS.DEFAULT_LIVE_MODEL);

    // v3.1.1 既定の4言語制限プロンプトが localStorage に残っている場合は v3.2.0 既定へ自動マイグレーション
    const rawSystemInstruction = ConfigManager.get(K.SYSTEM_INSTRUCTION, DEFAULT_SYSTEM_INSTRUCTION);
    if (!rawSystemInstruction.trim() || rawSystemInstruction.trim() === LEGACY_V311_SYSTEM_INSTRUCTION.trim()) {
      this.systemInstruction = DEFAULT_SYSTEM_INSTRUCTION;
      ConfigManager.set(K.SYSTEM_INSTRUCTION, DEFAULT_SYSTEM_INSTRUCTION);
    } else {
      this.systemInstruction = rawSystemInstruction;
    }

    this.autoSave = ConfigManager.get(K.AUTO_SAVE, 'false') === 'true';
    this.docMode = ConfigManager.get(K.DOC_MODE, 'new');
    this.includeSummaryInDoc = ConfigManager.get(K.INCLUDE_SUMMARY_IN_DOC, 'true') !== 'false';
    this.folderId = ConfigManager.get(K.FOLDER_ID, DEFAULT_SETTINGS.DEFAULT_FOLDER_ID);
    this.lastDocId = ConfigManager.get(K.LAST_DOC_ID, '');

    const savedFontSize = ConfigManager.get(K.FONT_SIZE, 'normal');
    this.fontSize = ['normal', 'large', 'xlarge'].includes(savedFontSize) ? savedFontSize : 'normal';

    const savedTheme = ConfigManager.get(K.THEME, '');
    if (savedTheme === 'dark' || savedTheme === 'light') {
      this.theme = savedTheme;
    } else {
      const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.theme = prefersDark ? 'dark' : 'light';
    }

    if (isIPadOrIOS() && this.audioSource === 'display') {
      this.audioSource = 'mic';
      ConfigManager.set(K.AUDIO_SOURCE, 'mic');
    }

    // Apply loaded values to DOM
    this.elInputApiKey.value = this.apiKey;
    this.elInputGasUrl.value = this.gasUrl;
    this.elInputGasToken.value = this.gasToken;
    if (this.elSelectAudioSource) this.elSelectAudioSource.value = this.audioSource;
    if (this.elSelectRecognitionProfile) this.elSelectRecognitionProfile.value = this.recognitionProfile;
    this.elSelectDirection.value = this.direction;
    if (this.elSelectPartnerLang) this.elSelectPartnerLang.value = this.partnerLang;
    if (this.elSelectCategory) this.elSelectCategory.value = this.category;
    if (this.elSelectChunkMode) this.elSelectChunkMode.value = this.chunkMode;
    if (this.elSelectContextWindow) this.elSelectContextWindow.value = String(this.contextWindow);
    if (this.elSelectGain) this.elSelectGain.value = this.gain;
    if (this.elSelectDefaultGain) this.elSelectDefaultGain.value = this.gain;
    if (this.elSelectVadMode) this.elSelectVadMode.value = this.vadMode;
    this.elSelectEngineMode.value = this.engineMode;
    this.elSelectLiveModel.value = this.liveModel;
    if (this.elInputSystemInstruction) this.elInputSystemInstruction.value = this.systemInstruction;
    this.elCheckAutoSave.checked = this.autoSave;
    if (this.elCheckIncludeSummary) this.elCheckIncludeSummary.checked = this.includeSummaryInDoc;
    if (this.elInputFolderId) this.elInputFolderId.value = this.folderId;
    if (this.elInputDefaultFolderId) this.elInputDefaultFolderId.value = this.folderId;
    if (this.lastDocId) this.elInputDocId.value = this.lastDocId;

    this._applyFontSize();
    this._applyTheme();
    this._syncCustomLangCheckboxesUI();
    this._syncTranslationControlsUI();
    this._syncAdvancedPanelUI();
    this._syncOnboardingUI();

    this.audioService.setGain(this.gain);
    this.audioService.setVadMode(this.vadMode);
    this.audioService.setDeviceId(this.micDeviceId);
    this.geminiClient.updateRecognitionSettings({
      direction: this.direction,
      recognitionProfile: this.recognitionProfile,
      partnerLang: this.partnerLang,
      customLangs: this.customLangs,
      systemInstruction: this.systemInstruction
    });
    this.webSpeechService.updateSettings({
      direction: this.direction,
      partnerLang: this.partnerLang,
      recognitionProfile: this.recognitionProfile
    });
    this.utteranceBuffer.setConfig({
      mode: this.chunkMode,
      direction: this.direction,
      partnerLang: this.partnerLang,
      recognitionProfile: this.recognitionProfile
    });

    for (const radio of this.elRadioDocModes) {
      if (radio.value === this.docMode) radio.checked = true;
    }
    this._syncDocModeUI();

    if (this.elInputTranslationPrompt) {
      this.elInputTranslationPrompt.value = this.translationCustomPrompt;
    }
    this._syncPromptPanelUI();

    if (this.elSelectSummaryRange) this.elSelectSummaryRange.value = this.summaryRange;
    if (this.elInputSummaryCustomMin) this.elInputSummaryCustomMin.value = String(this.summaryCustomMin);
    this._syncSummaryRangeUI();
  }

  // ---- Modular Event Binding ----
  _bindAllEvents() {
    this._bindRecordingEvents();
    this._bindControlEvents();
    this._bindPromptEvents();
    this._bindSummaryEvents();
    this._bindModalEvents();
    this._bindUxEvents();
    this._bindGeminiClientCallbacks();

    const unlockAudioHandler = () => {
      try { this.audioService.unlockContext(); } catch (e) {}
    };
    document.addEventListener('touchstart', unlockAudioHandler, { once: true, passive: true });
    document.addEventListener('click', unlockAudioHandler, { once: true, passive: true });
    window.addEventListener('hashchange', () => this._checkHashConfig());
  }

  _bindRecordingEvents() {
    this.elBtnToggleRecord.addEventListener('click', () => {
      this.audioService.unlockContext();
      this.toggleRecording();
    });
    this.elBtnPauseRecord.addEventListener('click', () => this.togglePause());

    if (this.elBtnFlushNow) {
      this.elBtnFlushNow.addEventListener('click', () => {
        if (this.utteranceBuffer.hasPendingText()) {
          this.utteranceBuffer.flushAll('manual-button');
        }
      });
    }
  }

  _bindControlEvents() {
    const K = ConfigManager.STORAGE_KEYS;

    this.elSelectAudioSource?.addEventListener('change', (e) => {
      this.audioSource = e.target.value;
      ConfigManager.set(K.AUDIO_SOURCE, this.audioSource);
      this.log('info', `音源切り替え: ${this.audioSource === 'display' ? '🖥️ タブ・PC音声 (イヤホン再生音)' : '🎤 マイク入力'}`);
      this._updateUIState();
      if (this.isRecording) {
        this.showToast('音源設定を変更しました。再起動後に適用されます。', 'info');
      }
    });

    this.elSelectRecognitionProfile?.addEventListener('change', (e) => {
      if (this.utteranceBuffer.hasPendingText()) {
        this.utteranceBuffer.flushAll('profile-change');
      }
      this.recognitionProfile = e.target.value;
      ConfigManager.set(K.RECOGNITION_PROFILE, this.recognitionProfile);
      this._syncCustomLangsInlineUI();
      this.geminiClient.updateRecognitionSettings({ recognitionProfile: this.recognitionProfile });
      this.webSpeechService.updateSettings({ recognitionProfile: this.recognitionProfile });
      this.utteranceBuffer.setConfig({ recognitionProfile: this.recognitionProfile });

      const profileLabel = RECOGNITION_PROFILES[this.recognitionProfile]?.label || this.recognitionProfile;
      const customDetail = this.recognitionProfile === 'multilingual-custom'
        ? ` (${this.customLangs.map((c) => resolveLanguageMeta(c).name).join('・')})`
        : '';
      this.log('info', `認識プロファイル変更: ${profileLabel}${customDetail}`);
      this.showToast(`認識モードを「${profileLabel}${customDetail}」に設定しました。`, 'info');
    });

    this.elSelectDirection.addEventListener('change', (e) => {
      if (this.utteranceBuffer.hasPendingText()) {
        this.utteranceBuffer.flushAll('direction-change');
      }
      this.direction = e.target.value;
      ConfigManager.set(K.DIRECTION, this.direction);
      this._syncTranslationControlsUI();
      this.geminiClient.updateRecognitionSettings({ direction: this.direction });
      this.webSpeechService.updateSettings({ direction: this.direction });
      this.utteranceBuffer.setConfig({
        mode: this.chunkMode,
        direction: this.direction,
        partnerLang: this.partnerLang,
        recognitionProfile: this.recognitionProfile
      });
      this.log('info', `翻訳モード変更: ${this.direction} (相手言語: ${getLanguageDisplayName(this.partnerLang)})`);
      if (this.isRecording) {
        this.showToast(
          this.activeEngine === 'gemini-live'
            ? '翻訳モードを変更し、認識設定を即時反映しました。'
            : '翻訳モードが変更されました。次回発話から適用されます。',
          'info'
        );
      }
    });

    this.elSelectPartnerLang?.addEventListener('change', (e) => {
      if (this.utteranceBuffer.hasPendingText()) {
        this.utteranceBuffer.flushAll('partner-lang-change');
      }
      this.partnerLang = normalizeLangCode(e.target.value) || 'en';
      ConfigManager.set(K.PARTNER_LANG, this.partnerLang);
      this.geminiClient.updateRecognitionSettings({ partnerLang: this.partnerLang });
      this.webSpeechService.updateSettings({ partnerLang: this.partnerLang });
      this.utteranceBuffer.setConfig({ partnerLang: this.partnerLang });
      const langName = getLanguageDisplayName(this.partnerLang);
      this.log('info', `相手言語を変更: ${langName} (${this.partnerLang})`);
      this.showToast(`相手言語を「${langName}」に設定しました。`, 'info');
    });

    this.elSelectChunkMode?.addEventListener('change', (e) => {
      this.chunkMode = e.target.value;
      ConfigManager.set(K.CHUNK_MODE, this.chunkMode);
      this.utteranceBuffer.setConfig({
        mode: this.chunkMode,
        direction: this.direction,
        partnerLang: this.partnerLang,
        recognitionProfile: this.recognitionProfile
      });
      this._updateAdvancedSummaryBadge();
      this.log('info', `翻訳区切りモード変更: ${this.chunkMode}`);
      this.showToast('翻訳の区切り設定を変更しました。', 'info');
    });

    this.elSelectContextWindow?.addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10);
      this.contextWindow = isNaN(val) ? 6 : val;
      ConfigManager.set(K.CONTEXT_WINDOW, String(this.contextWindow));
      this._updateAdvancedSummaryBadge();
      this.log('info', `翻訳時の前文脈参照件数を変更: ${this.contextWindow === 0 ? 'なし (独立翻訳)' : `直近${this.contextWindow}件`}`);
      this.showToast(
        this.contextWindow === 0
          ? '前文脈参照をオフ（独立翻訳）にしました。'
          : `直近 ${this.contextWindow} 件の前文脈を参照して翻訳します。`,
        'info'
      );
    });

    this.elSelectCategory?.addEventListener('change', (e) => {
      this.category = e.target.value;
      ConfigManager.set(K.CATEGORY, this.category);
      this._updateAdvancedSummaryBadge();
      this.log('info', `分野変更: ${this.category}`);
    });

    this.elSelectGain?.addEventListener('change', (e) => {
      this.gain = e.target.value;
      ConfigManager.set(K.GAIN, this.gain);
      this.audioService.setGain(this.gain);
      this._updateAdvancedSummaryBadge();
      this.log('info', `マイク集音感度変更: ${this.gain}x (遠距離ブースト適用)`);
      this.showToast(`マイク感度を ${this.gain}x に設定しました。`, 'info');
    });

    this.elSelectVadMode?.addEventListener('change', (e) => {
      this.vadMode = e.target.value;
      ConfigManager.set(K.VAD_MODE, this.vadMode);
      this.audioService.setVadMode(this.vadMode);
      this._updateAdvancedSummaryBadge();
      const label = VoiceActivityDetector.PRESETS[this.vadMode]?.label || this.vadMode;
      this.log('info', `VAD（音声区間検出）モード変更: ${label}`);
      this.showToast(`VAD を「${label}」に設定しました。`, 'info');
    });

    this.elBtnClearFeed.addEventListener('click', () => {
      if (this.records.length === 0) return;
      if (!confirm('タイムラインの翻訳履歴を全消去しますか？')) return;

      this.records = [];
      this.summaryHistory = [];
      this.currentSummaryId = null;
      this.savedRecordCount = 0;
      this.unsavedFinalizedDelta = 0;
      this.unreadNewCount = 0;
      if (this.elBtnNewItems) this.elBtnNewItems.style.display = 'none';
      this.utteranceBuffer.reset();
      this.hasUnsavedChanges = false;
      ConfigManager.remove(K.SESSION_DRAFT);
      this._lastDraftJson = '';
      this.elTranscriptList.innerHTML = '';
      this.elEmptyState.style.display = 'block';
      this.elRecordCount.textContent = '0 件の発話';
      if (this.elSummaryResultCard) this.elSummaryResultCard.style.display = 'none';
      if (this.elSelectSummaryHistory) {
        this.elSelectSummaryHistory.innerHTML = '';
        this.elSelectSummaryHistory.style.display = 'none';
      }
      this.timelineQuery = '';
      this.timelineFilter = 'all';
      if (this.elInputTimelineSearch) this.elInputTimelineSearch.value = '';
      if (this.elSelectTimelineFilter) this.elSelectTimelineFilter.value = 'all';
      this._applyTimelineFilter();
      this._updateSummaryTargetPreview();
      this._syncOnboardingUI();
      this._updateUIState();
      this.showToast('全履歴をクリアしました。', 'info');
    });

    this.elBtnSaveDocs.addEventListener('click', () => this.saveToDocs(false));

    for (const radio of this.elRadioDocModes) {
      radio.addEventListener('change', (e) => {
        this.docMode = e.target.value;
        ConfigManager.set(K.DOC_MODE, this.docMode);
        this._syncDocModeUI();
      });
    }

    this.elCheckIncludeSummary?.addEventListener('change', (e) => {
      this.includeSummaryInDoc = e.target.checked;
      ConfigManager.set(K.INCLUDE_SUMMARY_IN_DOC, String(this.includeSummaryInDoc));
    });

    this.elInputDocId.addEventListener('input', (e) => {
      const sanitized = GasStorageClient.extractDocId(e.target.value);
      if (sanitized !== e.target.value) e.target.value = sanitized;
      this.hasUnsavedChanges = true;
      this._updateUIState();
    });

    this.elBtnCopyAll.addEventListener('click', () => this.copyAllTranscripts());

    this.elToggleDiag.addEventListener('click', () => {
      const willShow = this.elDiagLogContainer.style.display === 'none';
      this.elDiagLogContainer.style.display = willShow ? 'block' : 'none';
      if (this.elDiagToggleIcon) {
        this.elDiagToggleIcon.textContent = willShow ? '▲ 非表示' : '▼ 表示';
      }
    });
  }

  _bindPromptEvents() {
    const K = ConfigManager.STORAGE_KEYS;

    this.elBtnTogglePromptPanel?.addEventListener('click', () => {
      this.promptPanelOpen = !this.promptPanelOpen;
      ConfigManager.set(K.TRANSLATION_PROMPT_OPEN, String(this.promptPanelOpen));
      this._syncPromptPanelUI();
    });

    this.elInputTranslationPrompt?.addEventListener('input', (e) => {
      this.translationCustomPrompt = e.target.value;
      ConfigManager.set(K.TRANSLATION_CUSTOM_PROMPT, this.translationCustomPrompt);
      this._updatePromptStatusBadge();
    });

    this.elBtnClearTranslationPrompt?.addEventListener('click', () => {
      this.translationCustomPrompt = '';
      if (this.elInputTranslationPrompt) this.elInputTranslationPrompt.value = '';
      ConfigManager.set(K.TRANSLATION_CUSTOM_PROMPT, '');
      this._updatePromptStatusBadge();
      this.log('info', '翻訳プロンプト追記をクリアしました（標準プロンプトのみに戻りました）。');
      this.showToast('追記プロンプトをクリアしました。', 'info');
    });

    this.elPromptPresetBtns?.forEach((btn) => {
      btn.addEventListener('click', () => {
        const presetKey = btn.dataset.preset;
        const presetText = TRANSLATION_PROMPT_PRESETS[presetKey];
        if (!presetText) return;
        this.translationCustomPrompt = presetText;
        if (this.elInputTranslationPrompt) {
          this.elInputTranslationPrompt.value = presetText;
          this.elInputTranslationPrompt.focus();
        }
        ConfigManager.set(K.TRANSLATION_CUSTOM_PROMPT, presetText);
        this._updatePromptStatusBadge();
        this.log('info', `翻訳プロンプトプリセット適用: ${presetKey}`);
        this.showToast('翻訳ニュアンスのプリセットを反映しました（自由に編集・追記できます）。', 'success');
      });
    });
  }

  _bindSummaryEvents() {
    const K = ConfigManager.STORAGE_KEYS;

    this.elSelectSummaryRange?.addEventListener('change', (e) => {
      this.summaryRange = e.target.value;
      ConfigManager.set(K.SUMMARY_RANGE, this.summaryRange);
      this._syncSummaryRangeUI();
      if (this.summaryRange === 'custom' && this.elInputSummaryCustomMin) {
        this.elInputSummaryCustomMin.focus();
        this.elInputSummaryCustomMin.select();
      }
    });

    if (this.elInputSummaryCustomMin) {
      const updateCustomMin = () => {
        let val = parseInt(this.elInputSummaryCustomMin.value, 10);
        if (isNaN(val) || val < 1) val = 1;
        if (val > 360) val = 360;
        this.summaryCustomMin = val;
        ConfigManager.set(K.SUMMARY_CUSTOM_MIN, String(val));
        this._updateSummaryTargetPreview();
      };
      this.elInputSummaryCustomMin.addEventListener('input', updateCustomMin);
      this.elInputSummaryCustomMin.addEventListener('change', () => {
        updateCustomMin();
        this.elInputSummaryCustomMin.value = String(this.summaryCustomMin);
      });
      this.elInputSummaryCustomMin.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          updateCustomMin();
          this.generateSummary();
        }
      });
    }

    this.elBtnGenerateSummary?.addEventListener('click', () => this.generateSummary());

    this.elSelectSummaryHistory?.addEventListener('change', (e) => {
      this.currentSummaryId = e.target.value;
      this._renderCurrentSummary();
    });

    this.elBtnCopySummary?.addEventListener('click', () => this.copyCurrentSummary());

    this.elBtnToggleSummaryBody?.addEventListener('click', () => {
      this.summaryBodyCollapsed = !this.summaryBodyCollapsed;
      if (this.elSummaryResultBody) {
        this.elSummaryResultBody.style.display = this.summaryBodyCollapsed ? 'none' : 'block';
      }
      this.elBtnToggleSummaryBody.textContent = this.summaryBodyCollapsed ? '▼ 開く' : '▲ 折りたたむ';
    });

    this.elBtnCloseSummary?.addEventListener('click', () => {
      if (this.elSummaryResultCard) this.elSummaryResultCard.style.display = 'none';
    });
  }

  _bindModalEvents() {
    const K = ConfigManager.STORAGE_KEYS;

    // Settings Modal
    this.elBtnSettings.addEventListener('click', () => this._openSettingsModal());
    this.elBtnCloseModal.addEventListener('click', () => this._closeSettingsModal());
    this.elModal.addEventListener('click', (e) => {
      if (e.target === this.elModal) this._closeSettingsModal();
    });

    this.elBtnToggleKeyVis.addEventListener('click', () => {
      const isHidden = this.elInputApiKey.type === 'password';
      this.elInputApiKey.type = isHidden ? 'text' : 'password';
      this.elBtnToggleKeyVis.textContent = isHidden ? '非表示' : '表示';
    });

    this.elCustomLangPresetBtns?.forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = CUSTOM_LANG_PRESETS[btn.dataset.langPreset];
        if (!preset || !this.elCustomLangsGrid) return;
        const set = new Set(preset);
        this.elCustomLangsGrid.querySelectorAll('input[type="checkbox"]').forEach((chk) => {
          chk.checked = set.has(chk.value);
        });
        this.showToast(`カスタム言語プリセット（${preset.length}言語）を選択しました。`, 'info');
      });
    });

    this.elBtnResetInstruction?.addEventListener('click', () => {
      if (this.elInputSystemInstruction) {
        this.elInputSystemInstruction.value = DEFAULT_SYSTEM_INSTRUCTION;
        this.showToast('systemInstruction を初期値にリセットしました。', 'info');
      }
    });

    this.elBtnSaveSettings.addEventListener('click', () => {
      this.apiKey = this.elInputApiKey.value.trim();
      this.gasUrl = this.elInputGasUrl.value.trim();
      this.gasToken = this.elInputGasToken.value.trim();
      this.engineMode = this.elSelectEngineMode.value;
      this.liveModel = this.elSelectLiveModel.value;
      this.autoSave = this.elCheckAutoSave.checked;

      this.customLangs = this._readCustomLangCheckboxes();
      this._syncCustomLangCheckboxesUI();
      ConfigManager.set(K.CUSTOM_LANGS, this.customLangs.join(','));

      if (this.elSelectDefaultGain) {
        this.gain = this.elSelectDefaultGain.value;
        ConfigManager.set(K.GAIN, this.gain);
        if (this.elSelectGain) this.elSelectGain.value = this.gain;
        this.audioService.setGain(this.gain);
      }
      if (this.elInputSystemInstruction) {
        this.systemInstruction = this.elInputSystemInstruction.value.trim() || DEFAULT_SYSTEM_INSTRUCTION;
        ConfigManager.set(K.SYSTEM_INSTRUCTION, this.systemInstruction);
      }
      if (this.elInputDefaultFolderId) {
        this.folderId = GasStorageClient.extractFolderId(this.elInputDefaultFolderId.value.trim()) || DEFAULT_SETTINGS.DEFAULT_FOLDER_ID;
        ConfigManager.set(K.FOLDER_ID, this.folderId);
        if (this.elInputFolderId) this.elInputFolderId.value = this.folderId;
      }

      ConfigManager.set(K.API_KEY, this.apiKey);
      ConfigManager.set(K.GAS_URL, this.gasUrl);
      ConfigManager.set(K.GAS_TOKEN, this.gasToken);
      ConfigManager.set(K.ENGINE_MODE, this.engineMode);
      ConfigManager.set(K.LIVE_MODEL, this.liveModel);
      ConfigManager.set(K.AUTO_SAVE, String(this.autoSave));

      this.geminiClient.updateRecognitionSettings({
        customLangs: this.customLangs,
        systemInstruction: this.systemInstruction
      });

      this._syncCustomLangsInlineUI();
      this._updateAdvancedSummaryBadge();
      this._syncOnboardingUI();
      this._closeSettingsModal();
      this.log('info', `設定保存: エンジン=${this.engineMode}, モデル=${this.liveModel}, カスタム言語=${this.customLangs.join(',')}`);
      this.showToast('設定を保存しました。', 'success');
    });

    this.elBtnTestGas.addEventListener('click', async () => {
      const url = this.elInputGasUrl.value.trim();
      if (!url) {
        this.elGasTestResult.textContent = 'URLを入力してください';
        this.elGasTestResult.className = 'test-result-text error';
        return;
      }
      this.elGasTestResult.textContent = '通信テスト中...';
      this.elGasTestResult.className = 'test-result-text';
      try {
        const res = await GasStorageClient.ping(url, this.elInputGasToken.value.trim());
        if (res.status === 'ok' || res.status === 'success') {
          const authNote = res.authRequired ? ' (認証保護あり)' : '';
          this.elGasTestResult.textContent = `✓ 接続成功 (v${res.version || APP_VERSION})${authNote}`;
          this.elGasTestResult.className = 'test-result-text success';
          this.log('success', `GAS Web App 疎通確認完了: ${url}`);
        } else {
          this.elGasTestResult.textContent = res.message || '応答受信 (エラーあり)';
          this.elGasTestResult.className = 'test-result-text error';
        }
      } catch (err) {
        this.elGasTestResult.textContent = '接続失敗: ' + err.message;
        this.elGasTestResult.className = 'test-result-text error';
        this.log('error', `GAS疎通失敗: ${err.message}`);
      }
    });

    // QR Code Modal
    this.elBtnOpenQr?.addEventListener('click', () => this._openQrModal());
    this.elCheckQrIncludePrompts?.addEventListener('change', () => this._renderQrCode());
    this.elBtnCloseQrModal?.addEventListener('click', () => this._closeQrModal());
    this.elBtnDoneQrModal?.addEventListener('click', () => this._closeQrModal());
    this.elQrModal?.addEventListener('click', (e) => {
      if (e.target === this.elQrModal) this._closeQrModal();
    });

    this.elBtnCopyShareUrl?.addEventListener('click', () => {
      if (!this.elInputShareUrl.value) return;
      this.copyToClipboard(this.elInputShareUrl.value)
        .then(() => this.showToast('スマホ連携用URLをクリップボードにコピーしました。', 'info'))
        .catch((err) => this.showToast('コピーに失敗しました: ' + err.message, 'error'));
    });

    // Close open card action dropdowns & export dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.card-menu')) {
        this._closeAllCardMenus();
      }
      if (!e.target.closest('.export-menu')) {
        this._closeExportMenu();
      }
    });

    // Consolidated Escape key handler for all modals & dropdown menus
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (this.elModal?.style.display === 'flex') this._closeSettingsModal();
      if (this.elQrModal?.style.display === 'flex') this._closeQrModal();
      this._closeAllCardMenus();
      this._closeExportMenu();
    });
  }

  _bindUxEvents() {
    const K = ConfigManager.STORAGE_KEYS;

    // Collapsible Advanced Panel
    this.elBtnToggleAdvanced?.addEventListener('click', () => {
      this.advancedPanelOpen = !this.advancedPanelOpen;
      ConfigManager.set(K.ADVANCED_OPEN, String(this.advancedPanelOpen));
      this._syncAdvancedPanelUI();
    });

    // Inline Custom Languages Edit Button
    this.elBtnEditCustomLangs?.addEventListener('click', () => {
      this._openSettingsModal({ focusCustomLangs: true });
    });

    // Onboarding Setup Button
    this.elBtnOnboardSettings?.addEventListener('click', () => {
      this._openSettingsModal();
    });

    // Microphone Input Device Selector
    this.elSelectMicDevice?.addEventListener('change', (e) => {
      this.micDeviceId = e.target.value || '';
      ConfigManager.set(K.MIC_DEVICE_ID, this.micDeviceId);
      this.audioService.setDeviceId(this.micDeviceId);
      const selectedLabel = e.target.selectedOptions?.[0]?.textContent || '既定のマイク';
      this.log('info', `マイク入力デバイス設定: ${selectedLabel}`);
      if (this.isRecording && this.audioSource === 'mic') {
        this.showToast('マイク設定を保存しました。次回録音開始時から新しいマイクが適用されます。', 'info');
      } else {
        this.showToast(`マイクを「${selectedLabel}」に設定しました。`, 'info');
      }
    });

    if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
      navigator.mediaDevices.addEventListener('devicechange', () => this._refreshMicDevices());
    }

    // Font Size Cycle & Light/Dark Theme Toggle
    this.elBtnFontSize?.addEventListener('click', () => {
      const order = ['normal', 'large', 'xlarge'];
      const idx = order.indexOf(this.fontSize);
      this.fontSize = order[(idx + 1) % order.length];
      ConfigManager.set(K.FONT_SIZE, this.fontSize);
      this._applyFontSize();
    });

    this.elBtnThemeToggle?.addEventListener('click', () => {
      this.theme = this.theme === 'dark' ? 'light' : 'dark';
      ConfigManager.set(K.THEME, this.theme);
      this._applyTheme();
    });

    // Local File Export Dropdown
    this.elBtnExportToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !this.elExportMenu?.classList.contains('open');
      this.elExportMenu?.classList.toggle('open', willOpen);
      this.elBtnExportToggle?.setAttribute('aria-expanded', String(Boolean(willOpen)));
    });

    this.elExportItems?.forEach((btn) => {
      btn.addEventListener('click', () => {
        const fmt = btn.dataset.export;
        this._closeExportMenu();
        this.exportTranscriptFile(fmt);
      });
    });

    // Timeline Keyword Search & Filter
    this.elInputTimelineSearch?.addEventListener('input', (e) => {
      this.timelineQuery = e.target.value || '';
      this._applyTimelineFilter();
    });
    this.elSelectTimelineFilter?.addEventListener('change', (e) => {
      this.timelineFilter = e.target.value || 'all';
      this._applyTimelineFilter();
    });

    // Sticky Mini Live Bar Controls & New Items FAB
    this.elBtnMiniFlush?.addEventListener('click', () => {
      if (this.utteranceBuffer.hasPendingText()) {
        this.utteranceBuffer.flushAll('mini-bar');
      }
    });
    this.elBtnMiniPause?.addEventListener('click', () => this.togglePause());
    this.elBtnMiniStop?.addEventListener('click', () => this.stopRecording());
    this.elBtnMiniTop?.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    this.elBtnNewItems?.addEventListener('click', () => {
      this.unreadNewCount = 0;
      if (this.elBtnNewItems) this.elBtnNewItems.style.display = 'none';
      const targetEl = (this.isRecording && this.elLivePreview) ? this.elLivePreview : this.elTranscriptList;
      if (targetEl && typeof targetEl.scrollIntoView === 'function') {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });

    window.addEventListener('scroll', () => {
      if (this._scrollRafPending) return;
      this._scrollRafPending = true;
      requestAnimationFrame(() => {
        this._scrollRafPending = false;
        this._onWindowScroll();
      });
    }, { passive: true });

    // Session Draft Restore / Discard
    this.elBtnDraftRestore?.addEventListener('click', () => this.restorePreviousDraft());
    this.elBtnDraftDiscard?.addEventListener('click', () => this.discardPreviousDraft());

    // Keyboard Shortcuts (e.code for layout-safe Alt combos + '/' quick search)
    window.addEventListener('keydown', (e) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        if (e.code === 'KeyR') {
          e.preventDefault();
          this.audioService.unlockContext();
          this.toggleRecording();
          return;
        }
        if (e.code === 'KeyP') {
          if (this.isRecording) {
            e.preventDefault();
            this.togglePause();
          }
          return;
        }
        if (e.code === 'Enter' || e.code === 'NumpadEnter') {
          if (this.utteranceBuffer.hasPendingText()) {
            e.preventDefault();
            this.utteranceBuffer.flushAll('shortcut');
          }
          return;
        }
        if (e.code === 'KeyS') {
          e.preventDefault();
          this.generateSummary();
          return;
        }
      }

      if (!e.altKey && !e.ctrlKey && !e.metaKey && e.key === '/') {
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
        const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(e.target?.isContentEditable);
        const modalOpen = this.elModal?.style.display === 'flex' || this.elQrModal?.style.display === 'flex';
        if (!isEditable && !modalOpen && this.elInputTimelineSearch) {
          e.preventDefault();
          this.elInputTimelineSearch.focus();
          this.elInputTimelineSearch.select();
        }
      }
    });

    // Data-loss protection: beforeunload, pagehide, visibilitychange (draft autosave + Wake Lock re-acquire)
    window.addEventListener('beforeunload', (e) => {
      this._saveDraftIfNeeded(true);
      if (this.isRecording || (this.hasUnsavedChanges && this.records.length > 0)) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    window.addEventListener('pagehide', () => {
      this._saveDraftIfNeeded(true);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this._saveDraftIfNeeded(true);
      } else if (document.visibilityState === 'visible' && this.isRecording) {
        this._acquireWakeLock();
      }
    });
  }

  _bindGeminiClientCallbacks() {
    this.geminiClient.onLogCallback = (type, msg) => this.log(type, msg);
    this.geminiClient.onErrorCallback = (err) => this.showToast(err, 'error');

    this.geminiClient.onReconnectingCallback = (attempt, maxAttempts, _delayMs, code) => {
      if (!this.isRecording) return;
      this._updateStatus('reconnecting', `再接続中 (${attempt}/${maxAttempts})...`);
      if (attempt === 1) {
        this.showToast(`回線が一時切断されました (Code: ${code})。録音を維持したまま自動再接続を試行します...`, 'warning');
      }
    };

    this.geminiClient.onReconnectedCallback = (attempt) => {
      if (!this.isRecording) return;
      this._updateStatus(this.isPaused ? 'paused' : 'recording');
      this.showToast(`音声認識サーバーへ自動再接続しました (${attempt}回目で復帰)。`, 'success');
    };

    this.geminiClient.onDisconnectCallback = (code, reason, exhausted) => {
      this.log('warn', `セッション終了切断: Code ${code}${reason ? ` (${reason})` : ''}`);
      if (exhausted) {
        this.showToast(`回線が復旧せず自動再接続の上限に達したため録音を停止しました (Code: ${code})。`, 'error');
      } else if (code === 1007 || code === 1008) {
        this.showToast(`認証または設定エラーのため録音を停止しました (Code: ${code})。APIキーを確認してください。`, 'error');
      }
      this.stopRecording();
    };

    this.geminiClient.onInterimCallback = (text) => {
      this.utteranceBuffer.pushInterim(text);
    };
    this.geminiClient.onFinalCallback = (rawFinalText, langCode) => {
      this.utteranceBuffer.pushFinal(rawFinalText, langCode, { fromWebSpeech: false });
    };
    this.geminiClient.onTurnCompleteCallback = () => {
      this.utteranceBuffer.markTurnComplete();
    };
  }

  // ---- UI Sync Helpers ----
  _syncTranslationControlsUI() {
    const usesPartner = ['auto', 'all-to-partner', 'ja-to-partner'].includes(this.direction);
    if (this.elGroupPartnerLang) {
      this.elGroupPartnerLang.style.display = usesPartner ? 'flex' : 'none';
    }
    const isStrictSingleSource = this.direction === 'en-to-ja' || this.direction === 'ja-to-partner';
    if (this.elSelectRecognitionProfile) {
      this.elSelectRecognitionProfile.disabled = isStrictSingleSource;
      this.elSelectRecognitionProfile.title = isStrictSingleSource
        ? '固定翻訳モード中は発話元の単一言語ロックが優先適用されます'
        : '音声認識の言語優先プロファイル（既定は日英精度を最優先しつつ、英語雑談に混じるヒンディー語・ウルドゥー語を補足）';
    }
    this._syncCustomLangsInlineUI();
  }

  _syncCustomLangsInlineUI() {
    if (!this.elCustomLangsInline) return;
    const isLocked = Boolean(this.elSelectRecognitionProfile?.disabled);
    const show = this.recognitionProfile === 'multilingual-custom' && !isLocked;
    this.elCustomLangsInline.style.display = show ? 'flex' : 'none';
    if (!show || !this.elCustomLangsInlineBadges) return;

    this.elCustomLangsInlineBadges.innerHTML = '';
    for (const code of (this.customLangs || DEFAULT_SETTINGS.DEFAULT_CUSTOM_LANGS)) {
      const meta = resolveLanguageMeta(code);
      const span = document.createElement('span');
      span.className = 'custom-lang-mini-badge';
      span.textContent = `${meta.badge} ${meta.name}`;
      this.elCustomLangsInlineBadges.appendChild(span);
    }
  }

  _syncAdvancedPanelUI() {
    if (this.elAdvancedPanelBody) {
      this.elAdvancedPanelBody.style.display = this.advancedPanelOpen ? 'flex' : 'none';
    }
    this.elBtnToggleAdvanced?.setAttribute('aria-expanded', String(Boolean(this.advancedPanelOpen)));
    if (this.elAdvancedToggleChevron) {
      this.elAdvancedToggleChevron.textContent = this.advancedPanelOpen ? '▲ 閉じる' : '▼ 開く';
    }
    this._updateAdvancedSummaryBadge();
  }

  _updateAdvancedSummaryBadge() {
    if (!this.elAdvancedSummaryBadge) return;
    const catMap = { Common: '全般', Casual: '雑談', HKC: 'HKC', 'EU-SRR': 'EU-SRR', HSE: 'HSE', IHM: 'IHM' };
    const chunkMap = { long: '4秒', 'extra-long': '6秒', balanced: '2.2秒' };
    const vadMap = { auto: 'VAD自動', sensitive: 'VAD敏感', strong: 'VAD強', off: 'VAD切' };
    const catLabel = catMap[this.category] || this.category;
    const chunkLabel = chunkMap[this.chunkMode] || this.chunkMode;
    const ctxLabel = Number(this.contextWindow) > 0 ? `文脈${this.contextWindow}` : '文脈切';
    const vadLabel = vadMap[this.vadMode] || 'VAD自動';
    this.elAdvancedSummaryBadge.textContent = `${catLabel}・${chunkLabel}・${ctxLabel}・${this.gain}x・${vadLabel}`;
  }

  _syncOnboardingUI() {
    if (!this.elOnboardingSetup || !this.elEmptyDefault) return;
    const needsSetup = !this.apiKey && this.records.length === 0;
    this.elOnboardingSetup.style.display = needsSetup ? 'block' : 'none';
    this.elEmptyDefault.style.display = needsSetup ? 'none' : 'block';
  }

  _applyFontSize() {
    if (typeof document === 'undefined' || !document.body) return;
    document.body.classList.toggle('fs-l', this.fontSize === 'large');
    document.body.classList.toggle('fs-xl', this.fontSize === 'xlarge');
    if (this.elBtnFontSize) {
      const labelMap = { normal: '🅰 標準', large: '🅰 大', xlarge: '🅰 特大' };
      this.elBtnFontSize.textContent = labelMap[this.fontSize] || '🅰 標準';
    }
  }

  _applyTheme() {
    if (typeof document === 'undefined' || !document.documentElement) return;
    document.documentElement.setAttribute('data-theme', this.theme === 'dark' ? 'dark' : 'light');
    if (this.elBtnThemeToggle) {
      const isDark = this.theme === 'dark';
      this.elBtnThemeToggle.textContent = isDark ? '☀️' : '🌙';
      this.elBtnThemeToggle.title = isDark ? 'ライトモードへ切替' : 'ダークモードへ切替';
    }
  }

  async _refreshMicDevices() {
    if (!this.elSelectMicDevice || typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter((d) => d.kind === 'audioinput');
      const prevVal = this.micDeviceId || '';
      this.elSelectMicDevice.innerHTML = '';

      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = '既定のマイク (システム設定)';
      this.elSelectMicDevice.appendChild(defaultOpt);

      let foundSaved = false;
      mics.forEach((mic, idx) => {
        if (!mic.deviceId || mic.deviceId === 'default') return;
        const opt = document.createElement('option');
        opt.value = mic.deviceId;
        opt.textContent = mic.label || `マイク入力 ${idx + 1}`;
        if (mic.deviceId === prevVal) {
          opt.selected = true;
          foundSaved = true;
        }
        this.elSelectMicDevice.appendChild(opt);
      });

      if (prevVal && !foundSaved) {
        this.elSelectMicDevice.value = '';
      }
      this.elSelectMicDevice.disabled = this.audioSource === 'display';
    } catch (e) {
      console.warn('[MicDevices] enumerateDevices failed:', e);
    }
  }

  // ---- Wake Lock, Elapsed Timer & Mini Bar / Scroll Helpers ----
  async _acquireWakeLock() {
    if (!this.isRecording || typeof navigator === 'undefined' || !navigator.wakeLock?.request) return;
    if (this._wakeLockSentinel && !this._wakeLockSentinel.released) return;
    try {
      this._wakeLockSentinel = await navigator.wakeLock.request('screen');
      this._wakeLockSentinel.addEventListener?.('release', () => {
        this._wakeLockSentinel = null;
      });
      this.log('info', '🔆 画面スリープ防止 (Screen Wake Lock) を有効化しました。');
    } catch (err) {
      console.warn('[WakeLock] acquire skipped:', err);
    }
  }

  async _releaseWakeLock() {
    if (!this._wakeLockSentinel) return;
    try {
      await this._wakeLockSentinel.release();
    } catch (e) {}
    this._wakeLockSentinel = null;
  }

  _startRecTimer() {
    this._stopRecTimer();
    this._recStartedAt = Date.now();
    if (this.elRecTimer) this.elRecTimer.style.display = 'inline-flex';
    this._updateRecTimerDisplay();
    this._recTimerInterval = setInterval(() => this._updateRecTimerDisplay(), 1000);
  }

  _stopRecTimer() {
    if (this._recTimerInterval) {
      clearInterval(this._recTimerInterval);
      this._recTimerInterval = null;
    }
    this._recStartedAt = 0;
    if (this.elRecTimer) this.elRecTimer.style.display = 'none';
    if (this.elMiniTimer) this.elMiniTimer.textContent = '00:00';
  }

  _updateRecTimerDisplay() {
    if (!this.isRecording || !this._recStartedAt) return;
    const formatted = formatElapsed(Date.now() - this._recStartedAt);
    if (this.elRecTimer) {
      this.elRecTimer.textContent = `${this.isPaused ? '⏸️' : '🔴'} ${formatted}`;
    }
    if (this.elMiniTimer) {
      this.elMiniTimer.textContent = formatted;
    }
  }

  _isNearTimelineTop() {
    if (typeof window === 'undefined') return true;
    if (window.scrollY < 200) return true;
    if (this.elTranscriptList && typeof this.elTranscriptList.getBoundingClientRect === 'function') {
      return this.elTranscriptList.getBoundingClientRect().top >= -40;
    }
    return true;
  }

  _syncMiniLiveBarVisibility() {
    if (!this.elMiniLiveBar) return;
    let shouldShow = false;
    if (this.isRecording && this.elLivePreview && typeof this.elLivePreview.getBoundingClientRect === 'function') {
      const rect = this.elLivePreview.getBoundingClientRect();
      shouldShow = rect.bottom < 8;
    }
    this.elMiniLiveBar.classList.toggle('is-visible', shouldShow);
    this.elMiniLiveBar.setAttribute('aria-hidden', String(!shouldShow));
  }

  _onWindowScroll() {
    this._syncMiniLiveBarVisibility();
    if (this.unreadNewCount > 0 && this._isNearTimelineTop()) {
      this.unreadNewCount = 0;
      if (this.elBtnNewItems) this.elBtnNewItems.style.display = 'none';
    }
  }

  // ---- Session Draft Auto-Save & Restore ----
  _initSessionDraft() {
    const K = ConfigManager.STORAGE_KEYS;
    try {
      const rawCurrent = ConfigManager.get(K.SESSION_DRAFT, '');
      if (rawCurrent) {
        const parsed = JSON.parse(rawCurrent);
        if (parsed && Array.isArray(parsed.records) && parsed.records.length > 0) {
          ConfigManager.set(K.SESSION_DRAFT_PREV, rawCurrent);
        }
        ConfigManager.remove(K.SESSION_DRAFT);
      }

      const rawPrev = ConfigManager.get(K.SESSION_DRAFT_PREV, '');
      if (rawPrev) {
        const prev = JSON.parse(rawPrev);
        if (prev && Array.isArray(prev.records) && prev.records.length > 0) {
          this._pendingPrevDraft = prev;
          const savedTimeStr = prev.savedAt
            ? new Date(prev.savedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '';
          if (this.elDraftRestoreText) {
            this.elDraftRestoreText.textContent = `前回の未保存セッション（${prev.records.length}件の発話${savedTimeStr ? `・${savedTimeStr}` : ''}）が見つかりました。`;
          }
          if (this.elDraftRestoreBanner) {
            this.elDraftRestoreBanner.style.display = 'flex';
          }
        } else {
          ConfigManager.remove(K.SESSION_DRAFT_PREV);
        }
      }
    } catch (e) {
      console.warn('[SessionDraft] Failed to load previous draft:', e);
    }

    this._draftAutosaveTimer = setInterval(() => this._saveDraftIfNeeded(), 4000);
  }

  _saveDraftIfNeeded(force = false) {
    const K = ConfigManager.STORAGE_KEYS;
    if (!this.records || this.records.length === 0 || (!this.hasUnsavedChanges && !this.isRecording && !this.records.some((r) => r.isTranslating))) {
      if (this.records.length === 0 && this._lastDraftJson !== '') {
        ConfigManager.remove(K.SESSION_DRAFT);
        this._lastDraftJson = '';
      }
      return;
    }

    try {
      const draftObj = serializeSessionDraft({
        records: this.records,
        summaryHistory: this.summaryHistory,
        category: this.category,
        savedAt: Date.now()
      });
      const compareKey = JSON.stringify({ r: draftObj.records, s: draftObj.summaryHistory, c: draftObj.category });
      if (!force && compareKey === this._lastDraftJson) return;
      this._lastDraftJson = compareKey;
      ConfigManager.set(K.SESSION_DRAFT, JSON.stringify(draftObj));
    } catch (e) {
      console.warn('[SessionDraft] Save failed:', e);
    }
  }

  restorePreviousDraft() {
    const K = ConfigManager.STORAGE_KEYS;
    if (!this._pendingPrevDraft) return;

    const restoredCount = Array.isArray(this._pendingPrevDraft.records) ? this._pendingPrevDraft.records.length : 0;
    const merged = mergeRestoredDraft(this._pendingPrevDraft, this.records, this.summaryHistory);
    this.records = merged.records;
    this.summaryHistory = merged.summaryHistory;

    if (this.elTranscriptList) {
      this.elTranscriptList.innerHTML = '';
      for (const rec of this.records) {
        this._appendSingleCard(rec, { skipScrollAdjust: true });
      }
    }

    if (this.summaryHistory.length > 0) {
      this.currentSummaryId = this.summaryHistory[0].id;
      this._refreshSummaryHistorySelect();
      if (this.elSummaryResultCard) this.elSummaryResultCard.style.display = 'flex';
      this._renderCurrentSummary();
    }

    this._pendingPrevDraft = null;
    ConfigManager.remove(K.SESSION_DRAFT_PREV);
    if (this.elDraftRestoreBanner) this.elDraftRestoreBanner.style.display = 'none';

    this.hasUnsavedChanges = this.records.length > 0;
    this.unsavedFinalizedDelta = this.getFinalizedRecords().length;
    this._saveDraftIfNeeded(true);
    this._applyTimelineFilter();
    this._updateSummaryTargetPreview();
    this._syncOnboardingUI();
    this._updateUIState();
    this.log('success', `前回の未保存セッション（${restoredCount}件）を復元しました。`);
    this.showToast(`前回の未保存セッション（${restoredCount}件）を復元しました。`, 'success');
  }

  discardPreviousDraft() {
    const K = ConfigManager.STORAGE_KEYS;
    this._pendingPrevDraft = null;
    ConfigManager.remove(K.SESSION_DRAFT_PREV);
    if (this.elDraftRestoreBanner) this.elDraftRestoreBanner.style.display = 'none';
    this.showToast('前回の未保存セッションを破棄しました。', 'info');
  }

  // ---- Timeline Search/Filter & Local File Export ----
  _applyTimelineFilter() {
    const total = this.records.length;
    const isFilterActive = Boolean((this.timelineQuery || '').trim()) || (this.timelineFilter && this.timelineFilter !== 'all');
    let visibleCount = 0;

    for (const rec of this.records) {
      const cardEl = document.getElementById(rec.id);
      const matched = matchesTimelineFilter(rec, this.timelineQuery, this.timelineFilter);
      if (matched) visibleCount += 1;
      if (cardEl) {
        cardEl.classList.toggle('is-hidden-by-filter', !matched);
      }
    }

    if (this.elTimelineFilterCount) {
      if (isFilterActive && total > 0) {
        this.elTimelineFilterCount.style.display = 'inline-block';
        this.elTimelineFilterCount.textContent = `表示 ${visibleCount}/${total}件`;
      } else {
        this.elTimelineFilterCount.style.display = 'none';
      }
    }

    if (this.elFilterEmpty) {
      this.elFilterEmpty.style.display = (total > 0 && isFilterActive && visibleCount === 0) ? 'block' : 'none';
    }
  }

  _closeExportMenu() {
    this.elExportMenu?.classList.remove('open');
    this.elBtnExportToggle?.setAttribute('aria-expanded', 'false');
  }

  exportTranscriptFile(format = 'md') {
    if (this.records.length === 0) {
      this.showToast('保存する発話履歴がありません。', 'warning');
      return;
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const customTitle = this.elInputDocTitle?.value.trim() || '';
    const latestSummary = this.summaryHistory[0] || null;

    let content = '';
    let ext = 'md';
    let mime = 'text/markdown;charset=utf-8';

    if (format === 'csv') {
      content = buildTranscriptCsv(this.records);
      ext = 'csv';
      mime = 'text/csv;charset=utf-8';
    } else if (format === 'txt') {
      content = buildTranscriptTxt(this.records, { category: this.category, title: customTitle, latestSummary });
      ext = 'txt';
      mime = 'text/plain;charset=utf-8';
    } else {
      content = buildTranscriptMarkdown(this.records, { category: this.category, title: customTitle, latestSummary });
      ext = 'md';
      mime = 'text/markdown;charset=utf-8';
    }

    const safeBase = customTitle
      ? customTitle.replace(/[\\/:*?"<>|]/g, '_').slice(0, 50)
      : `Transcript_${stamp}`;
    const filename = `${safeBase}.${ext}`;
    this._downloadFile(content, filename, mime);
    this.log('success', `ローカルファイル出力完了: ${filename} (${this.records.length}件)`);
    this.showToast(`「${filename}」をダウンロードしました。`, 'success');
  }

  _downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  _syncDocModeUI() {
    const isExisting = this.docMode === 'existing';
    this.elInputDocTitle.style.display = isExisting ? 'none' : 'block';
    if (this.elInputFolderId) this.elInputFolderId.style.display = isExisting ? 'none' : 'block';
    this.elInputDocId.style.display = isExisting ? 'block' : 'none';
  }

  _syncPromptPanelUI() {
    if (this.elPromptPanelBody) {
      this.elPromptPanelBody.style.display = this.promptPanelOpen ? 'flex' : 'none';
    }
    this.elBtnTogglePromptPanel?.setAttribute('aria-expanded', String(this.promptPanelOpen));
    if (this.elPromptToggleChevron) {
      this.elPromptToggleChevron.textContent = this.promptPanelOpen ? '▲ 閉じる' : '▼ 開く';
    }
    this._updatePromptStatusBadge();
  }

  _updatePromptStatusBadge() {
    if (!this.elPromptStatusBadge) return;
    const len = (this.translationCustomPrompt || '').trim().length;
    this.elPromptStatusBadge.textContent = len > 0 ? `追記適用中 (${len}文字)` : '標準のみ';
    this.elPromptStatusBadge.className = len > 0 ? 'tag prompt-status-badge is-active' : 'tag prompt-status-badge';
  }

  _syncSummaryRangeUI() {
    if (this.elSummaryCustomWrapper) {
      this.elSummaryCustomWrapper.style.display = this.summaryRange === 'custom' ? 'inline-flex' : 'none';
    }
    this._updateSummaryTargetPreview();
  }

  // ---- Summary Management ----
  _getSummaryLookbackSpec() {
    if (this.summaryRange === 'all') {
      return { mode: 'all', minutes: null, label: 'セッション全体' };
    }
    const rawVal = this.summaryRange === 'custom'
      ? (this.elInputSummaryCustomMin ? this.elInputSummaryCustomMin.value : this.summaryCustomMin)
      : this.summaryRange;
    const parsed = parseInt(rawVal, 10);
    const minutes = (!isNaN(parsed) && parsed >= 1) ? Math.min(360, parsed) : 5;
    return { mode: 'minutes', minutes, label: `直近${minutes}分` };
  }

  _getRecordTimestampMs(record) {
    if (record && typeof record.createdAt === 'number' && !isNaN(record.createdAt)) {
      return record.createdAt;
    }
    if (record && typeof record.time === 'string') {
      const m = record.time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (m) {
        const d = new Date();
        d.setHours(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3] || '0', 10), 0);
        return d.getTime();
      }
    }
    return Date.now();
  }

  _collectRecordsForSummary(nowMs = Date.now()) {
    const spec = this._getSummaryLookbackSpec();
    const matchedRecords = spec.mode === 'all'
      ? [...this.records]
      : this.records.filter((r) => this._getRecordTimestampMs(r) >= nowMs - spec.minutes * 60 * 1000);
    const pendingText = this.utteranceBuffer ? this.utteranceBuffer.getPendingText() : '';
    return {
      spec,
      records: matchedRecords,
      pendingText,
      totalCount: matchedRecords.length + (pendingText ? 1 : 0)
    };
  }

  _updateSummaryTargetPreview() {
    if (!this.elSummaryTargetPreview) return;
    const { records, pendingText } = this._collectRecordsForSummary();
    const count = records.length;
    const hasPending = Boolean(pendingText);
    if (count > 0 || hasPending) {
      this.elSummaryTargetPreview.textContent = hasPending ? `対象: ${count}件 (+認識中)` : `対象: ${count}件`;
      this.elSummaryTargetPreview.className = 'tag summary-target-badge has-items';
    } else {
      this.elSummaryTargetPreview.textContent = '対象: 0件';
      this.elSummaryTargetPreview.className = 'tag summary-target-badge';
    }
  }

  async generateSummary() {
    if (this.isSummarizing) return;

    if (!this.apiKey) {
      this.showToast('サマリー生成には Gemini API キーが必要です。', 'warning');
      this._openSettingsModal();
      return;
    }

    const nowMs = Date.now();
    const { spec, records, pendingText, totalCount } = this._collectRecordsForSummary(nowMs);

    if (totalCount === 0) {
      const hint = this.records.length > 0
        ? `（セッション全体には ${this.records.length} 件あります。対象範囲を広げてお試しください）`
        : '';
      this.showToast(`${spec.label}以内にサマリー対象の発話がありません${hint}`, 'warning');
      return;
    }

    this.isSummarizing = true;
    this.summaryBodyCollapsed = false;
    if (this.elBtnGenerateSummary) {
      this.elBtnGenerateSummary.disabled = true;
      this.elBtnGenerateSummary.textContent = '⏳ サマリー生成中...';
    }
    if (this.elSummaryResultCard) this.elSummaryResultCard.style.display = 'flex';
    if (this.elSummaryResultBody) this.elSummaryResultBody.style.display = 'block';
    if (this.elBtnToggleSummaryBody) this.elBtnToggleSummaryBody.textContent = '▲ 折りたたむ';
    if (this.elSummaryMetaBadge) {
      this.elSummaryMetaBadge.textContent = `${spec.label} / ${records.length}件${pendingText ? '+進行中' : ''} を集計中...`;
    }
    if (this.elSummaryContent) {
      this.elSummaryContent.className = 'summary-content is-loading';
      this.elSummaryContent.textContent = `⏳ ${spec.label}の会話内容を分析し、日本語サマリーを生成しています...`;
    }

    const endTimeStr = new Date(nowMs).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const startTimeStr = records.length > 0 ? (records[0].time || endTimeStr) : endTimeStr;
    this.log('info', `会話サマリー生成開始 (範囲: ${spec.label}, 対象: ${records.length}件${pendingText ? '+認識中1件' : ''})`);

    try {
      const result = await this.summaryService.generateSummary({
        records,
        pendingText,
        rangeLabel: spec.mode === 'all' ? `セッション全体 (${startTimeStr}〜${endTimeStr})` : `${spec.label} (${startTimeStr}〜${endTimeStr})`,
        category: this.category,
        customPrompt: this.translationCustomPrompt,
        apiKey: this.apiKey
      });

      const entry = {
        id: `sum_${nowMs}`,
        generatedAt: endTimeStr,
        rangeLabel: spec.label,
        timeSpan: `${startTimeStr}〜${endTimeStr}`,
        count: records.length,
        hasPending: Boolean(pendingText),
        markdown: result.summary,
        model: result.model
      };

      this.summaryHistory.unshift(entry);
      this.currentSummaryId = entry.id;
      this.hasUnsavedChanges = true;
      this._saveDraftIfNeeded();
      this._refreshSummaryHistorySelect();
      this._renderCurrentSummary();
      this.showToast(`${spec.label}のサマリーを出力しました！`, 'success');
    } catch (err) {
      console.error('Summary generation failed:', err);
      this.log('error', `サマリー生成失敗: ${err.message}`);
      if (this.elSummaryContent) {
        this.elSummaryContent.className = 'summary-content';
        this.elSummaryContent.textContent = `⚠️ サマリー生成に失敗しました: ${err.message}`;
      }
      this.showToast('サマリー生成エラー: ' + err.message, 'error');
    } finally {
      this.isSummarizing = false;
      if (this.elBtnGenerateSummary) {
        this.elBtnGenerateSummary.disabled = false;
        this.elBtnGenerateSummary.textContent = '✨ サマリー出力';
      }
    }
  }

  _refreshSummaryHistorySelect() {
    if (!this.elSelectSummaryHistory) return;
    if (this.summaryHistory.length <= 1) {
      this.elSelectSummaryHistory.style.display = 'none';
      return;
    }
    this.elSelectSummaryHistory.innerHTML = '';
    for (const s of this.summaryHistory) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.generatedAt} (${s.rangeLabel} / ${s.count}件)`;
      if (s.id === this.currentSummaryId) opt.selected = true;
      this.elSelectSummaryHistory.appendChild(opt);
    }
    this.elSelectSummaryHistory.style.display = 'inline-block';
  }

  _renderCurrentSummary() {
    const entry = this.summaryHistory.find((s) => s.id === this.currentSummaryId) || this.summaryHistory[0];
    if (!entry) return;
    if (this.elSummaryMetaBadge) {
      this.elSummaryMetaBadge.textContent = `${entry.rangeLabel} (${entry.timeSpan} / ${entry.count}件${entry.hasPending ? '+進行中' : ''})`;
    }
    if (this.elSummaryContent) {
      this.elSummaryContent.className = 'summary-content';
      this.elSummaryContent.innerHTML = this._renderSummaryMarkdown(entry.markdown);
    }
  }

  _renderSummaryMarkdown(md) {
    const lines = String(md || '').split(/\r?\n/);
    const htmlParts = [];
    let inList = false;

    const formatInline = (text) => this._escapeHTML(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const closeListIfOpen = () => {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        closeListIfOpen();
        continue;
      }
      if (/^#{1,4}\s+/.test(line)) {
        closeListIfOpen();
        htmlParts.push(`<h4>${formatInline(line.replace(/^#{1,4}\s+/, ''))}</h4>`);
      } else if (/^([-*•・]|\d+\.)\s+/.test(line)) {
        if (!inList) {
          htmlParts.push('<ul>');
          inList = true;
        }
        htmlParts.push(`<li>${formatInline(line.replace(/^([-*•・]|\d+\.)\s+/, ''))}</li>`);
      } else {
        closeListIfOpen();
        htmlParts.push(`<p>${formatInline(line)}</p>`);
      }
    }
    closeListIfOpen();
    return htmlParts.join('');
  }

  copyCurrentSummary() {
    const entry = this.summaryHistory.find((s) => s.id === this.currentSummaryId) || this.summaryHistory[0];
    if (!entry) {
      this.showToast('コピーするサマリーがありません。', 'warning');
      return;
    }
    const header = `## 会話サマリー [${entry.rangeLabel} / ${entry.timeSpan} / ${entry.count}件 / 分野: ${this.category}]\n\n`;
    this.copyToClipboard(header + entry.markdown)
      .then(() => this.showToast('サマリーをMarkdown形式でコピーしました。', 'info'))
      .catch((err) => this.showToast('コピーに失敗しました: ' + err.message, 'error'));
  }

  // ---- Recording Lifecycle ----
  async toggleRecording() {
    if (this.isStarting) return;
    if (this.isRecording) {
      await this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  async startRecording() {
    if (this.isStarting || this.isRecording) return;

    if (window.location.protocol === 'file:') {
      this.log('error', 'file:// プロトコルではブラウザのマイク機能が無効化されます。HTTPS または http://localhost 上でアクセスしてください。');
      this.showToast('file:// ではマイクが動作しません。ローカルサーバーまたはGitHub Pagesで開いてください。', 'error');
      return;
    }

    if (!this.apiKey) {
      this.showToast('Gemini API キーを設定してください。', 'warning');
      this._openSettingsModal();
      return;
    }

    this.isStarting = true;
    this.elBtnToggleRecord.disabled = true;
    this.log('info', `=== 翻訳セッション開始 (モード: ${this.engineMode}) ===`);

    try {
      this._updateStatus('connecting');
      let liveConnected = false;

      if (this.engineMode === 'auto' || this.engineMode === 'gemini-live') {
        try {
          this.log('info', 'Gemini Live WebSocket へ接続試行中...');
          await this.geminiClient.connect(this.apiKey, this.direction, this.liveModel, this.systemInstruction, {
            recognitionProfile: this.recognitionProfile,
            partnerLang: this.partnerLang,
            customLangs: this.customLangs
          });

          const isDisplay = this.audioSource === 'display';
          this.log('info', isDisplay ? '🖥️ タブ・PC音声キャプチャ開始 (16kHz PCM)...' : '🎤 マイク音声取得開始 (Anti-Aliased 16kHz)...');
          if (isDisplay) {
            this.showToast('共有ウィンドウで「タブの音声も共有」にチェックを入れてください。', 'info');
          }
          this.audioService.setVadMode(this.vadMode);
          await this.audioService.start(
            (chunk) => this.geminiClient.sendAudioChunk(chunk),
            (volume, isSpeaking) => this._updateMeter(volume, isSpeaking),
            this.audioSource,
            () => {
              this.log('info', 'ユーザーにより画面・音声共有が停止されました。');
              this.stopRecording();
            },
            {
              onStreamEnd: () => this.geminiClient.sendAudioStreamEnd(),
              onVadState: (vadRes) => this._updateVadBadge(vadRes)
            }
          );

          this.activeEngine = 'gemini-live';
          this.elEngineBadge.textContent = 'Gemini Live';
          this.elLiveEngineTag.textContent = 'Gemini Live';
          this._updateVadBadge({
            state: this.vadMode === 'off' ? 'off' : 'silent',
            isSpeaking: this.vadMode === 'off',
            savedPct: 0
          });
          liveConnected = true;
          this.log('success', 'Gemini Live WebSocket 音声認識がアクティブになりました。');
        } catch (liveErr) {
          this.log('warn', `Gemini Live 接続失敗: ${liveErr.message}`);
          try { this.audioService.stop(); } catch (e) {}
          try { this.geminiClient.disconnect(); } catch (e) {}

          if (this.engineMode === 'gemini-live') throw liveErr;
          this.log('info', '自動フォールバック: ブラウザ標準音声認識 (Web Speech API) を起動します...');
        }
      }

      if (!liveConnected) {
        if (this.audioSource === 'display') {
          throw new Error('タブ・PC音声キャプチャは Gemini Live API で動作します。Gemini APIキーおよびネットワーク設定をご確認ください。');
        }
        if (!this.webSpeechService.isSupported()) {
          throw new Error('ブラウザの音声認識APIが利用できません。Chrome または Edge でアクセスしてください。');
        }

        this.webSpeechService.start(
          this.direction,
          (interim) => this.utteranceBuffer.pushInterim(interim),
          (finalText, lang) => this.utteranceBuffer.pushFinal(finalText, lang, { fromWebSpeech: true }),
          (err) => {
            this.log('error', `WebSpeechエラー: ${err.message}`);
            this.showToast(err.message, 'error');
          },
          {
            partnerLang: this.partnerLang,
            recognitionProfile: this.recognitionProfile
          }
        );

        this.activeEngine = 'web-speech';
        this.elEngineBadge.textContent = 'Web Speech';
        this.elLiveEngineTag.textContent = 'Web Speech';
        this._updateVadBadge({ state: 'webspeech', isSpeaking: true, savedPct: 0 });
        this.log('success', 'ブラウザ標準音声認識 + Gemini翻訳パイプラインが起動しました。');
      }

      this.isRecording = true;
      this.isPaused = false;
      this.elLivePreview.style.display = 'flex';
      if (this.advancedPanelOpen) {
        this.advancedPanelOpen = false;
        ConfigManager.set(ConfigManager.STORAGE_KEYS.ADVANCED_OPEN, 'false');
        this._syncAdvancedPanelUI();
      }
      this.utteranceBuffer.setConfig({
        mode: this.chunkMode,
        direction: this.direction,
        partnerLang: this.partnerLang,
        recognitionProfile: this.recognitionProfile
      });
      this.utteranceBuffer.reset();
      this._startRecTimer();
      this._acquireWakeLock();
      this._refreshMicDevices();
      this._updateStatus('recording');
      this._updateUIState();
      this.showToast('音声認識と自動翻訳を開始しました。マイクに向かって話してください。', 'success');
    } catch (err) {
      console.error('Failed to start session:', err);
      this.log('error', `起動処理失敗: ${err.message}`);
      try { this.audioService.stop(); } catch (e) {}
      try { this.geminiClient.disconnect(); } catch (e) {}
      try { this.webSpeechService.stop(); } catch (e) {}
      this.isRecording = false;
      this.isPaused = false;
      this.activeEngine = 'none';
      this.elLivePreview.style.display = 'none';
      this._stopRecTimer();
      this._releaseWakeLock();
      this._updateMeter(0);
      this._updateStatus('idle');
      this._updateUIState();
      this.showToast('開始エラー: ' + err.message, 'error');
    } finally {
      this.isStarting = false;
      this.elBtnToggleRecord.disabled = false;
    }
  }

  async stopRecording() {
    this.log('info', '翻訳セッションを停止中...');
    if (this.activeEngine === 'gemini-live') {
      try { this.audioService.stop(); } catch (e) {}
      try { this.geminiClient.disconnect(); } catch (e) {}
    } else if (this.activeEngine === 'web-speech') {
      try { this.webSpeechService.stop(); } catch (e) {}
    }

    this.utteranceBuffer?.flushAll('stop-recording');
    this.isRecording = false;
    this.isPaused = false;
    this.activeEngine = 'none';
    this.elLivePreview.style.display = 'none';
    this._stopRecTimer();
    this._releaseWakeLock();
    this._updateMeter(0);
    this._updateStatus('idle');
    this._updateUIState();
    this._saveDraftIfNeeded(true);
    this.log('info', 'セッション停止完了。');
    this.showToast('翻訳セッションを停止しました。', 'info');

    if (this.autoSave && this.hasUnsavedChanges && this.gasUrl) {
      await this.saveToDocs(true);
    }
  }

  togglePause() {
    if (!this.isRecording) return;

    if (this.isPaused) {
      if (this.activeEngine === 'gemini-live') this.audioService.resume();
      else if (this.activeEngine === 'web-speech') this.webSpeechService.resume();

      this.isPaused = false;
      this.elLivePreview.style.display = 'flex';
      this.utteranceBuffer._notifyDisplay();
      this._updateStatus('recording');
      this.showToast('翻訳を再開しました。', 'info');
    } else {
      if (this.activeEngine === 'gemini-live') this.audioService.pause();
      else if (this.activeEngine === 'web-speech') this.webSpeechService.pause();

      if (this.utteranceBuffer.hasPendingText()) {
        this.utteranceBuffer.flushAll('pause-recording');
      }
      this.isPaused = true;
      this._updateMeter(0, false);
      if (this.activeEngine === 'gemini-live') {
        this._updateVadBadge({ state: 'paused', savedPct: this.audioService.vad.getSavedPercent() });
      }
      this.utteranceBuffer._notifyDisplay();
      this._updateStatus('paused');
      this.showToast('翻訳を一時停止しました。', 'warning');
    }
    this._updateRecTimerDisplay();
    this._updateUIState();
  }

  _updateMeter(volume, isSpeaking = true) {
    const widthPct = `${Math.min(100, Math.round(volume * 400))}%`;
    const isMuted = !isSpeaking && this.vadMode !== 'off';
    if (this.elMeterBar) {
      this.elMeterBar.style.width = widthPct;
      this.elMeterBar.classList.toggle('is-muted', isMuted);
    }
    if (this.elMiniMeterBar) {
      this.elMiniMeterBar.style.width = widthPct;
      this.elMiniMeterBar.classList.toggle('is-muted', isMuted);
    }
  }

  _updateVadBadge({ state, savedPct = 0 } = {}) {
    if (!this.elLiveVadBadge) return;
    const savedStr = savedPct > 0 ? ` (-${savedPct}%)` : '';
    if (state === 'webspeech') {
      this.elLiveVadBadge.textContent = '🌐 ブラウザVAD';
      this.elLiveVadBadge.className = 'tag vad-badge vad-off';
    } else if (state === 'off') {
      this.elLiveVadBadge.textContent = '📡 常時送信';
      this.elLiveVadBadge.className = 'tag vad-badge vad-off';
    } else if (state === 'paused') {
      this.elLiveVadBadge.textContent = `⏸️ VAD一時停止${savedStr}`;
      this.elLiveVadBadge.className = 'tag vad-badge vad-paused';
    } else if (state === 'speaking') {
      this.elLiveVadBadge.textContent = `🎙️ 発話送信中${savedStr}`;
      this.elLiveVadBadge.className = 'tag vad-badge vad-speaking';
    } else {
      this.elLiveVadBadge.textContent = `💤 無音節約中${savedStr}`;
      this.elLiveVadBadge.className = 'tag vad-badge vad-silent';
    }
  }

  _renderLiveDisplay({ committed, interim, totalChars, targetLang, skipTranslation = false, silenceSec }) {
    if (!this.elLiveText) return;
    const hasText = Boolean(committed || interim);

    if (this.elBtnFlushNow) {
      this.elBtnFlushNow.disabled = !hasText;
    }
    if (this.elBtnMiniFlush) {
      this.elBtnMiniFlush.disabled = !hasText;
    }

    if (this.elLiveBufferStatus) {
      if (!hasText) {
        this.elLiveBufferStatus.textContent = this.isPaused ? '一時停止中' : '発話待機中';
        this.elLiveBufferStatus.className = 'tag buffer-status';
      } else if (skipTranslation) {
        this.elLiveBufferStatus.textContent = `原語蓄積中 ${totalChars}文字（無音${silenceSec}秒でそのまま確定）`;
        this.elLiveBufferStatus.className = 'tag buffer-status is-buffering';
      } else if (targetLang === 'ja') {
        this.elLiveBufferStatus.textContent = `原語蓄積中 ${totalChars}文字（無音${silenceSec}秒 or 文末で長文日本語訳）`;
        this.elLiveBufferStatus.className = 'tag buffer-status is-buffering';
      } else {
        const targetLabel = getLanguageDisplayName(targetLang);
        this.elLiveBufferStatus.textContent = `原語蓄積中 ${totalChars}文字（無音${silenceSec}秒で${targetLabel}訳）`;
        this.elLiveBufferStatus.className = 'tag buffer-status is-buffering';
      }
    }

    if (!hasText) {
      const placeholderMsg = this.isRecording
        ? (this.isPaused ? '一時停止中 (音声を認識しません)' : '話しかけてください...')
        : 'マイクを開始すると、リアルタイムの原語プレビューが表示されます...';
      this.elLiveText.className = 'live-text live-placeholder';
      this.elLiveText.textContent = placeholderMsg;
      if (this.elMiniLiveText) {
        this.elMiniLiveText.textContent = placeholderMsg;
      }
      this._updateSummaryTargetPreview();
      return;
    }

    this.elLiveText.className = 'live-text';
    const parts = [];
    if (committed) parts.push(`<bdi class="live-committed">${this._escapeHTML(committed)}</bdi>`);
    if (interim) parts.push(`<bdi class="live-interim">${this._escapeHTML(interim)}</bdi>`);
    this.elLiveText.innerHTML = parts.join(committed && interim ? ' ' : '');
    this.elLiveText.scrollTop = this.elLiveText.scrollHeight;
    if (this.elMiniLiveText) {
      const combined = `${committed || ''} ${interim || ''}`.trim();
      const lines = combined.split(/\r?\n/).filter(Boolean);
      const lastLine = lines.length > 0 ? lines[lines.length - 1] : combined;
      this.elMiniLiveText.textContent = lastLine.length > 120 ? `…${lastLine.slice(-120)}` : lastLine;
    }
    this._updateSummaryTargetPreview();
  }

  // ---- Transcript & Translation Management ----
  _getRecentContext(targetRecordId = null) {
    const windowSize = Number(this.contextWindow);
    if (!windowSize || windowSize <= 0) return [];

    let priorRecords = this.records;
    if (targetRecordId) {
      const targetIdx = this.records.findIndex((r) => r.id === targetRecordId);
      priorRecords = targetIdx !== -1
        ? this.records.slice(0, targetIdx)
        : this.records.filter((r) => r.id !== targetRecordId);
    }

    return priorRecords
      .filter((r) => r && ((r.originalText && r.originalText.trim()) || (r.translatedText && r.translatedText.trim())))
      .slice(-windowSize)
      .map((r) => {
        const hasValidTranslation =
          !r.isTranslating &&
          r.translatedText &&
          r.translatedText.trim() !== '' &&
          !r.translatedText.startsWith('【翻訳');
        return {
          time: r.time || '',
          speaker: r.speaker || '',
          speakerLang: r.speakerLang || '',
          original: r.originalText || '',
          translated: hasValidTranslation ? r.translatedText : ''
        };
      });
  }

  getFinalizedRecords() {
    return this.records.filter((r) => !r.isTranslating && r.translatedText && r.translatedText.trim() !== '');
  }

  _getLangBadgeClass(record) {
    const base = record.speakerLang || 'en';
    const isMixed = (Array.isArray(record.mixedSubLangs) && record.mixedSubLangs.length > 0) || Boolean(record.colloquialMix);
    return `tag lang-badge lang-${base}${isMixed ? ' lang-mixed' : ''}`;
  }

  _handleFinalSpeech(finalText, langCode) {
    if (!finalText || finalText.trim() === '') return;

    const timestamp = new Date().toLocaleTimeString('ja-JP', { hour12: false });
    const recordId = `card_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const route = resolveTranslationRoute(
      finalText,
      this.direction,
      this.partnerLang,
      langCode,
      this.recognitionProfile
    );
    const detectedLang = route.srcLang;
    const initialSpeaker = detectedLang === 'ja' ? ROLES[0] : ROLES[1];
    const engineLabel = this.activeEngine === 'gemini-live' ? 'Gemini Live' : 'Web Speech';

    const record = {
      id: recordId,
      time: timestamp,
      createdAt: Date.now(),
      speaker: initialSpeaker,
      speakerLang: detectedLang,
      mixedSubLangs: route.langInfo.mixedSubLangs || [],
      colloquialMix: route.langInfo.colloquialMix || null,
      hintedLangCode: langCode || null,
      originalText: finalText,
      translatedText: '',
      engine: engineLabel,
      direction: this.direction,
      partnerLang: this.partnerLang,
      recognitionProfile: this.recognitionProfile,
      category: this.category,
      isTranslating: true
    };

    this.records.push(record);
    this.hasUnsavedChanges = true;
    this._appendSingleCard(record);
    this._saveDraftIfNeeded();
    this._updateSummaryTargetPreview();
    this._updateUIState();

    this.log('info', `確定発話をFIFOキューに投入 [${formatDocLanguageLabel(record.speakerLang, record.mixedSubLangs, record.colloquialMix)}]: "${finalText}"`);

    this.translationService.enqueue(
      finalText,
      this.direction,
      this.category,
      this.apiKey,
      this.gasUrl,
      this.gasToken,
      recordId,
      (id, transResult) => this._onTranslationComplete(id, transResult),
      () => this._getRecentContext(recordId),
      this.translationCustomPrompt,
      {
        partnerLang: this.partnerLang,
        recognitionProfile: this.recognitionProfile,
        hintedLangCode: langCode || null
      }
    );
  }

  _closeAllCardMenus(exceptCard = null) {
    if (!this.elTranscriptList) return;
    const openCards = this.elTranscriptList.querySelectorAll('.card.transcript-item.menu-open');
    openCards.forEach((openCard) => {
      if (openCard === exceptCard) return;
      openCard.classList.remove('menu-open');
      const trigger = openCard.querySelector('.card-menu-btn');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  }

  _appendSingleCard(item, options = {}) {
    this.elEmptyState.style.display = 'none';
    this.elRecordCount.textContent = `${this.records.length} 件の発話`;

    const card = document.createElement('div');
    card.className = 'card transcript-item';
    card.id = item.id;

    const speakerClass = item.speaker?.includes('Auditor')
      ? 'auditor'
      : item.speaker?.includes('Yard')
      ? 'yard'
      : '';
    const speakerShort = getSpeakerShortLabel(item.speaker);
    const langFullName = getLanguageDisplayName(item.speakerLang, item.mixedSubLangs, item.colloquialMix);
    const langBadgeText = getLanguageBadge(item.speakerLang, item.mixedSubLangs, item.colloquialMix);
    const langBadgeClass = this._getLangBadgeClass(item);
    const engineFull = item.engine || 'Gemini Live';
    const engineShort = getEngineShortLabel(engineFull);

    card.innerHTML = `
      <div class="meta">
        <div class="meta-left">
          <span class="card-time"><span class="time-icon">🕒 </span>${this._escapeHTML(item.time)}</span>
          <span id="${item.id}_spk" class="tag speaker ${speakerClass}" title="${this._escapeHTML(item.speaker || '発話')}（クリックで話者切替）">${this._escapeHTML(speakerShort)}</span>
          <span id="${item.id}_lang" class="${this._escapeHTML(langBadgeClass)}" title="${this._escapeHTML(langFullName)}">${this._escapeHTML(langBadgeText)}</span>
          <span class="tag engine" title="${this._escapeHTML(engineFull)}"><span class="engine-full">${this._escapeHTML(engineFull)}</span><span class="engine-short">${this._escapeHTML(engineShort)}</span></span>
        </div>
        <div class="card-actions card-menu">
          <button type="button" class="small-btn card-menu-btn" data-a="toggle-menu" aria-haspopup="true" aria-expanded="false" title="操作メニュー (コピー・修正・再翻訳・削除)">⋯ ▾</button>
          <div class="card-menu-dropdown" role="menu">
            <button type="button" class="card-menu-item" data-a="copy" role="menuitem">📋 コピー</button>
            <button type="button" class="card-menu-item" data-a="edit" role="menuitem">✏️ 修正</button>
            <button type="button" class="card-menu-item" data-a="retry" role="menuitem">🔄 再翻訳</button>
            <button type="button" class="card-menu-item card-menu-item-danger" data-a="delete" role="menuitem">🗑️ 削除</button>
          </div>
        </div>
      </div>
      <div id="${item.id}_view" class="body-grid">
        <div class="column">
          <span class="label">原文</span>
          <div id="${item.id}_orig" class="original" dir="auto">${this._escapeHTML(item.originalText)}</div>
        </div>
        <div class="column">
          <span class="label">訳文</span>
          <div id="${item.id}_trans" class="translation" dir="auto">${item.isTranslating ? '⏳ 翻訳中...' : this._escapeHTML(item.translatedText)}</div>
        </div>
      </div>
      <div id="${item.id}_edit" class="edit">
        <div class="edit-grid">
          <textarea id="${item.id}_edit_orig" dir="auto" placeholder="原文">${this._escapeHTML(item.originalText)}</textarea>
          <textarea id="${item.id}_edit_trans" dir="auto" placeholder="訳文">${this._escapeHTML(item.translatedText)}</textarea>
        </div>
        <div class="edit-actions">
          <button type="button" class="btn btn-sm btn-outline" data-a="cancel" title="Esc">キャンセル</button>
          <button type="button" class="btn btn-sm btn-primary" data-a="save" title="Ctrl/⌘ + Enter">保存</button>
        </div>
      </div>
    `;

    card.addEventListener('keydown', (e) => {
      if (!e.target || e.target.tagName !== 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.code === 'Enter')) {
        e.preventDefault();
        card.querySelector('[data-a="save"]')?.click();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        card.querySelector('[data-a="cancel"]')?.click();
      }
    });

    card.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-a]');
      const action = btn ? btn.dataset.a : null;

      if (action === 'toggle-menu') {
        e.stopPropagation();
        const willOpen = !card.classList.contains('menu-open');
        this._closeAllCardMenus(willOpen ? card : null);
        card.classList.toggle('menu-open', willOpen);
        btn.setAttribute('aria-expanded', String(willOpen));
        return;
      }

      if (action === 'copy') {
        this._closeAllCardMenus();
        const langNote = getLanguageDisplayName(item.speakerLang, item.mixedSubLangs, item.colloquialMix);
        const textToCopy = `[${item.time}] (${item.speaker} / ${langNote})\n原文: ${item.originalText}\n訳文: ${item.translatedText || '(翻訳中...)'}`;
        this.copyToClipboard(textToCopy)
          .then(() => this.showToast('カード内容をコピーしました。', 'info'))
          .catch((err) => this.showToast('コピーに失敗しました: ' + err.message, 'error'));
        return;
      }

      if (action === 'edit') {
        this._closeAllCardMenus();
        // 常に最新の原文・訳文を編集欄へ同期してから開く（翻訳完了後の空欄バグ防止）
        const editOrigEl = document.getElementById(`${item.id}_edit_orig`);
        const editTransEl = document.getElementById(`${item.id}_edit_trans`);
        if (editOrigEl) editOrigEl.value = item.originalText || '';
        if (editTransEl) editTransEl.value = item.translatedText || '';
        document.getElementById(`${item.id}_view`).style.display = 'none';
        document.getElementById(`${item.id}_edit`).classList.add('open');
        editTransEl?.focus();
        return;
      }

      if (action === 'cancel') {
        document.getElementById(`${item.id}_edit`).classList.remove('open');
        document.getElementById(`${item.id}_view`).style.display = 'grid';
        return;
      }

      if (action === 'save') {
        const editOrig = document.getElementById(`${item.id}_edit_orig`).value.trim();
        const editTrans = document.getElementById(`${item.id}_edit_trans`).value.trim();
        item.originalText = editOrig;
        item.translatedText = editTrans;
        item.isTranslating = false;

        if (editOrig) {
          const updatedRoute = resolveTranslationRoute(editOrig, this.direction, this.partnerLang, null, this.recognitionProfile);
          item.speakerLang = updatedRoute.srcLang;
          item.mixedSubLangs = updatedRoute.langInfo.mixedSubLangs || [];
          item.colloquialMix = updatedRoute.langInfo.colloquialMix || null;
          const langEl = document.getElementById(`${item.id}_lang`);
          if (langEl) {
            langEl.className = this._getLangBadgeClass(item);
            langEl.textContent = getLanguageBadge(item.speakerLang, item.mixedSubLangs, item.colloquialMix);
            langEl.title = getLanguageDisplayName(item.speakerLang, item.mixedSubLangs, item.colloquialMix);
          }
        }

        document.getElementById(`${item.id}_orig`).textContent = editOrig;
        document.getElementById(`${item.id}_trans`).textContent = editTrans;
        document.getElementById(`${item.id}_edit`).classList.remove('open');
        document.getElementById(`${item.id}_view`).style.display = 'grid';
        this.hasUnsavedChanges = true;
        this._applyTimelineFilter();
        this._saveDraftIfNeeded();
        this._updateUIState();
        this.showToast('修正内容を保存しました（Googleドキュメントへ未反映）。', 'success');
        return;
      }

      if (action === 'retry') {
        this._closeAllCardMenus();
        item.isTranslating = true;
        document.getElementById(`${item.id}_trans`).textContent = '⏳ 再翻訳中...';
        this.hasUnsavedChanges = true;
        this._updateUIState();
        this.translationService.enqueue(
          item.originalText,
          this.direction,
          this.category,
          this.apiKey,
          this.gasUrl,
          this.gasToken,
          item.id,
          (id, transResult) => this._onTranslationComplete(id, transResult),
          () => this._getRecentContext(item.id),
          this.translationCustomPrompt,
          {
            partnerLang: this.partnerLang,
            recognitionProfile: this.recognitionProfile,
            hintedLangCode: item.hintedLangCode || null
          }
        );
        this.showToast('再翻訳を開始しました。', 'info');
        return;
      }

      if (action === 'delete') {
        this._closeAllCardMenus();
        if (!confirm('この発話をタイムラインから削除しますか？')) return;
        this.records = this.records.filter((x) => x.id !== item.id);
        card.remove();
        this.hasUnsavedChanges = true;
        this.elRecordCount.textContent = `${this.records.length} 件の発話`;
        if (this.records.length === 0) {
          this.elEmptyState.style.display = 'block';
        }
        this._applyTimelineFilter();
        this._saveDraftIfNeeded();
        this._updateSummaryTargetPreview();
        this._syncOnboardingUI();
        this._updateUIState();
        this.showToast('発話を削除しました。', 'info');
        return;
      }

      const spkTarget = e.target.closest('.tag.speaker');
      if (spkTarget && spkTarget.id === `${item.id}_spk`) {
        const currIdx = ROLES.indexOf(item.speaker);
        item.speaker = ROLES[(currIdx + 1 + ROLES.length) % ROLES.length];
        spkTarget.textContent = getSpeakerShortLabel(item.speaker);
        spkTarget.title = `${item.speaker}（クリックで話者切替）`;
        spkTarget.className = 'tag speaker';
        if (item.speaker.includes('Auditor')) spkTarget.classList.add('auditor');
        else if (item.speaker.includes('Yard')) spkTarget.classList.add('yard');
        this.hasUnsavedChanges = true;
        this._applyTimelineFilter();
        this._saveDraftIfNeeded();
        this._updateUIState();
      }
    });

    const wasScrolledDown = !options.skipScrollAdjust && !this._isNearTimelineTop();
    const supportsNativeAnchor = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('overflow-anchor', 'auto');
    const prevHeight = (wasScrolledDown && !supportsNativeAnchor && this.elTranscriptList)
      ? this.elTranscriptList.offsetHeight
      : 0;

    this.elTranscriptList.prepend(card);
    this._applyTimelineFilter();

    const isVisibleCard = !card.classList.contains('is-hidden-by-filter');
    if (wasScrolledDown && isVisibleCard) {
      if (!supportsNativeAnchor && this.elTranscriptList && typeof window !== 'undefined' && typeof window.scrollBy === 'function') {
        const delta = this.elTranscriptList.offsetHeight - prevHeight;
        if (delta > 0) window.scrollBy(0, delta);
      }
      this.unreadNewCount += 1;
      if (this.elNewItemsCount) this.elNewItemsCount.textContent = String(this.unreadNewCount);
      if (this.elBtnNewItems) this.elBtnNewItems.style.display = 'inline-flex';
    }
  }

  _onTranslationComplete(recordId, transResult) {
    const record = this.records.find((r) => r.id === recordId);
    // 翻訳中にユーザーがカードを削除した場合は安全にスキップ
    if (!record) return;

    record.translatedText = transResult.translated;
    if (transResult.speakerLang && transResult.speakerLang !== 'auto') {
      record.speakerLang = transResult.speakerLang;
    }
    if (Array.isArray(transResult.mixedSubLangs)) {
      record.mixedSubLangs = transResult.mixedSubLangs;
    }
    if (transResult.colloquialMix !== undefined) {
      record.colloquialMix = transResult.colloquialMix;
    }
    record.isTranslating = false;

    const transEl = document.getElementById(`${recordId}_trans`);
    if (transEl) transEl.textContent = transResult.translated;

    const editTransEl = document.getElementById(`${recordId}_edit_trans`);
    const editBox = document.getElementById(`${recordId}_edit`);
    if (editTransEl && (!editBox || !editBox.classList.contains('open'))) {
      editTransEl.value = transResult.translated;
    }

    const langEl = document.getElementById(`${recordId}_lang`);
    if (langEl && record.speakerLang) {
      langEl.className = this._getLangBadgeClass(record);
      langEl.textContent = getLanguageBadge(record.speakerLang, record.mixedSubLangs, record.colloquialMix);
      langEl.title = getLanguageDisplayName(record.speakerLang, record.mixedSubLangs, record.colloquialMix);
    }

    this.unsavedFinalizedDelta += 1;
    this.hasUnsavedChanges = true;
    this._applyTimelineFilter();
    this._saveDraftIfNeeded();
    this._updateUIState();
    this.log('success', `翻訳反映完了: "${transResult.translated}"`);

    if (this.autoSave && this.unsavedFinalizedDelta >= 10 && this.gasUrl) {
      this.saveToDocs(true);
    }
  }

  // ---- Google Docs Sync ----
  async saveToDocs(isAuto = false) {
    if (this.isSavingDocs) {
      if (!isAuto) this.showToast('現在Googleドキュメントへ保存処理中です。完了までお待ちください。', 'info');
      return;
    }

    if (!this.gasUrl) {
      if (!isAuto) {
        this.showToast('GAS Web App URLが未設定です。設定画面から登録してください。', 'warning');
        this._openSettingsModal();
      }
      return;
    }

    this.isSavingDocs = true;
    try {
      if (this.translationService.isProcessing || this.translationService.queue.length > 0) {
        this.log('info', '進行中の翻訳処理の完了を待機しています...');
        let waitLimit = 0;
        while ((this.translationService.isProcessing || this.translationService.queue.length > 0) && waitLimit < 110) {
          await new Promise((r) => setTimeout(r, 200));
          waitLimit++;
        }
      }

      const finalizedItems = this.getFinalizedRecords();
      if (finalizedItems.length === 0) {
        if (!isAuto) {
          const hasPending = this.records.some((r) => r.isTranslating);
          this.showToast(
            hasPending
              ? '現在翻訳処理中のため、完了後に保存してください。'
              : '保存対象の確定翻訳がありません。録音・発話後に保存してください。',
            'info'
          );
        }
        return;
      }

      const recordsToSave = finalizedItems.map((r) => ({
        timestamp: r.time,
        speaker: r.speaker,
        speakerLang: formatDocLanguageLabel(r.speakerLang, r.mixedSubLangs, r.colloquialMix),
        original: r.originalText,
        translated: r.translatedText,
        engine: r.engine
      }));

      const latestSum = this.summaryHistory[0];
      const summaryPayload = (this.includeSummaryInDoc && latestSum && latestSum.markdown)
        ? {
            markdown: latestSum.markdown,
            rangeLabel: latestSum.rangeLabel || '',
            timeSpan: latestSum.timeSpan || '',
            count: latestSum.count || 0,
            generatedAt: latestSum.generatedAt || ''
          }
        : null;

      const isExistingMode = this.docMode === 'existing';
      let docId = isExistingMode ? (this.elInputDocId.value.trim() || this.lastDocId) : '';
      docId = GasStorageClient.extractDocId(docId);
      const title = this.elInputDocTitle.value.trim();
      const folderId = this.elInputFolderId ? this.elInputFolderId.value.trim() : this.folderId;

      this.elBtnSaveDocs.disabled = true;
      this.elSaveDocsText.textContent = isExistingMode ? 'ドキュメント同期中...' : 'ドキュメント保存中...';
      this.log(
        'info',
        `Google ドキュメント保存開始 (確定翻訳: ${recordsToSave.length}件${summaryPayload ? ' + 最新サマリー' : ''}, モード: ${isExistingMode && docId ? '同一Doc上書き同期' : '新規作成'})...`
      );

      let result;
      try {
        result = await GasStorageClient.saveTranscript(this.gasUrl, {
          token: this.gasToken,
          documentId: docId,
          title,
          folderId,
          records: recordsToSave,
          summary: summaryPayload,
          direction: this.direction,
          partnerLang: this.partnerLang,
          recognitionProfile: this.recognitionProfile,
          category: this.category,
          model: this.liveModel,
          saveMode: 'sync'
        });
      } catch (saveErr) {
        if (saveErr.code === 'DOC_NOT_FOUND' && docId) {
          this.log('warn', `指定ドキュメント (ID: ${docId}) が開けなかったため、新規Googleドキュメントとして再作成します...`);
          result = await GasStorageClient.saveTranscript(this.gasUrl, {
            token: this.gasToken,
            documentId: '',
            title,
            folderId,
            records: recordsToSave,
            summary: summaryPayload,
            direction: this.direction,
            partnerLang: this.partnerLang,
            recognitionProfile: this.recognitionProfile,
            category: this.category,
            model: this.liveModel,
            saveMode: 'sync'
          });
        } else {
          throw saveErr;
        }
      }

      this.savedRecordCount = recordsToSave.length;
      this.unsavedFinalizedDelta = 0;
      this.hasUnsavedChanges = false;
      if (!this.records.some((r) => r.isTranslating)) {
        ConfigManager.remove(ConfigManager.STORAGE_KEYS.SESSION_DRAFT);
        this._lastDraftJson = '';
      }
      this._updateUIState();

      if (result.documentId) {
        this.lastDocId = result.documentId;
        ConfigManager.set(ConfigManager.STORAGE_KEYS.LAST_DOC_ID, this.lastDocId);
        this.elInputDocId.value = this.lastDocId;

        this.docMode = 'existing';
        ConfigManager.set(ConfigManager.STORAGE_KEYS.DOC_MODE, 'existing');
        for (const radio of this.elRadioDocModes) {
          if (radio.value === 'existing') radio.checked = true;
        }
        this._syncDocModeUI();
      }

      this.elSavedDocBanner.style.display = 'flex';
      this.elSavedDocLink.href = result.documentUrl;
      this.elSavedDocLink.textContent = `📄 ${result.documentTitle || 'ドキュメント'} を開く ↗`;
      if (result.folderUrl && this.elSavedFolderLink && this.elSavedFolderSep) {
        this.elSavedFolderSep.style.display = 'inline';
        this.elSavedFolderLink.style.display = 'inline';
        this.elSavedFolderLink.href = result.folderUrl;
        this.elSavedFolderLink.textContent = `📁 ${result.folderName || '保存先フォルダ'} ↗`;
      }

      this.log('success', `Google ドキュメント同期保存完了 (確定翻訳: 全${recordsToSave.length}件): ${result.documentUrl}`);
      this.showToast(
        isAuto
          ? `確定翻訳 (全${recordsToSave.length}件) をGoogleドキュメントに自動同期しました。`
          : `確定翻訳 (全${recordsToSave.length}件) をひとつのGoogleドキュメントとして保存完了しました！`,
        'success'
      );
    } catch (err) {
      console.error('Save to Docs failed:', err);
      this.log('error', `GAS保存失敗: ${err.message}`);
      this.showToast('保存に失敗しました: ' + err.message, 'error');
    } finally {
      this.isSavingDocs = false;
      this.elBtnSaveDocs.disabled = false;
      this.elSaveDocsText.textContent = 'Google ドキュメントに保存';
      this._updateUIState();
    }
  }

  // ---- Modals, Clipboard & QR Sync ----
  _openSettingsModal(options = {}) {
    this._syncCustomLangCheckboxesUI();
    this._refreshMicDevices();
    this.elModal.style.display = 'flex';
    document.body.classList.add('modal-open');

    if (options.focusCustomLangs && this.elCustomLangsGrid) {
      setTimeout(() => {
        this.elCustomLangsGrid.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        this.elCustomLangsGrid.classList.add('is-highlighted');
        if (this._highlightTimer) clearTimeout(this._highlightTimer);
        this._highlightTimer = setTimeout(() => {
          this.elCustomLangsGrid?.classList.remove('is-highlighted');
        }, 1800);
      }, 60);
    } else {
      setTimeout(() => this.elInputApiKey?.focus(), 50);
    }
  }

  _closeSettingsModal() {
    this.elModal.style.display = 'none';
    document.body.classList.remove('modal-open');
  }

  _closeQrModal() {
    this.elQrModal.style.display = 'none';
    document.body.classList.remove('modal-open');
  }

  copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => this._fallbackCopyText(text));
    }
    return this._fallbackCopyText(text);
  }

  _fallbackCopyText(text) {
    return new Promise((resolve, reject) => {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.width = '2em';
        textArea.style.height = '2em';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        textArea.setSelectionRange(0, text.length);
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) resolve();
        else reject(new Error('execCommand copy failed'));
      } catch (err) {
        reject(err);
      }
    });
  }

  copyAllTranscripts() {
    if (this.records.length === 0) {
      this.showToast('コピーする履歴がありません。', 'warning');
      return;
    }

    const md = buildTranscriptMarkdown(this.records, {
      category: this.category,
      title: this.elInputDocTitle?.value.trim() || '',
      latestSummary: this.summaryHistory[0] || null
    });

    this.copyToClipboard(md)
      .then(() => this.showToast('全履歴をMarkdown形式でコピーしました。', 'info'))
      .catch((err) => this.showToast('コピーに失敗しました: ' + err.message, 'error'));
  }

  _updateStatus(state, customLabel = null) {
    const statusMap = {
      recording: ['status-recording', '録音中 (REC)'],
      connecting: ['status-connecting', 'WS接続中...'],
      reconnecting: ['status-reconnecting', '再接続中...'],
      paused: ['status-connecting', '一時停止中'],
      error: ['status-error', 'エラー'],
      idle: ['status-idle', '待機中']
    };
    const [cls, defaultLabel] = statusMap[state] || statusMap.idle;
    this.elStatusBadge.className = `status-badge ${cls}`;
    this.elStatusText.textContent = customLabel || defaultLabel;
  }

  _updateUIState() {
    const recIcon = this.elBtnToggleRecord.querySelector('.btn-icon-symbol');
    const recText = this.elBtnToggleRecord.querySelector('.btn-text');
    const pauseIcon = this.elBtnPauseRecord.querySelector('.btn-icon-symbol');
    const pauseText = this.elBtnPauseRecord.querySelector('.btn-text');

    if (this.isRecording) {
      this.elBtnToggleRecord.classList.add('is-recording');
      recIcon.textContent = '⏹️';
      recText.textContent = '録音停止';
      this.elBtnPauseRecord.disabled = false;
    } else {
      this.elBtnToggleRecord.classList.remove('is-recording');
      const isDisplay = this.audioSource === 'display';
      recIcon.textContent = isDisplay ? '🖥️' : '🎤';
      recText.textContent = isDisplay ? 'PC音声共有開始' : '録音開始';
      this.elBtnPauseRecord.disabled = true;
    }

    pauseText.textContent = this.isPaused ? '再開' : '一時停止';
    pauseIcon.textContent = this.isPaused ? '▶️' : '⏸️';
    if (this.elBtnMiniPause) {
      this.elBtnMiniPause.textContent = this.isPaused ? '▶️' : '⏸️';
    }
    if (this.elSelectMicDevice) {
      this.elSelectMicDevice.disabled = this.audioSource === 'display';
    }

    this._syncOnboardingUI();
    this._syncMiniLiveBarVisibility();

    const finalizedCount = this.getFinalizedRecords().length;
    const unsavedCount = this.unsavedFinalizedDelta;

    if (unsavedCount > 0 || (this.hasUnsavedChanges && finalizedCount > 0)) {
      this.elUnsavedBadge.style.display = 'inline-block';
      this.elUnsavedBadge.textContent = unsavedCount > 0 ? String(unsavedCount) : '未保存';
      this.elUnsavedBadge.title = unsavedCount > 0
        ? `${unsavedCount}件の未保存確定翻訳があります`
        : '編集・削除等の未保存の変更があります';
    } else {
      this.elUnsavedBadge.style.display = 'none';
    }
  }

  _buildCompactSharePayload(includeFreePrompts = false) {
    const compact = {};
    if (this.apiKey) compact.k = this.apiKey;

    // GAS標準URLはデプロイIDのみ抽出して40文字以上削減
    if (this.gasUrl) {
      const m = this.gasUrl.trim().match(/^https:\/\/script\.google\.com\/macros\/s\/([^/]+)\/exec$/);
      if (m) compact.gd = m[1];
      else compact.gu = this.gasUrl.trim();
    }
    if (this.gasToken) compact.t = this.gasToken;

    // 既定値と異なる設定のみを短縮キーで格納（標準利用時は追加0バイト）
    if (this.recognitionProfile && this.recognitionProfile !== DEFAULT_SETTINGS.DEFAULT_RECOGNITION_PROFILE) {
      compact.rp = this.recognitionProfile;
    }
    if (this.direction && this.direction !== 'auto') compact.d = this.direction;
    if (this.partnerLang && this.partnerLang !== DEFAULT_SETTINGS.DEFAULT_PARTNER_LANG) {
      compact.pl = this.partnerLang;
    }
    const defaultCustomStr = DEFAULT_SETTINGS.DEFAULT_CUSTOM_LANGS.join(',');
    const currentCustomStr = Array.isArray(this.customLangs) ? this.customLangs.join(',') : defaultCustomStr;
    if (this.recognitionProfile === 'multilingual-custom' && currentCustomStr && currentCustomStr !== defaultCustomStr) {
      compact.cl = currentCustomStr;
    }
    if (this.category && this.category !== DEFAULT_SETTINGS.DEFAULT_CATEGORY) compact.c = this.category;
    if (this.chunkMode && this.chunkMode !== 'long') compact.cm = this.chunkMode;
    if (this.contextWindow !== undefined && Number(this.contextWindow) !== 6) compact.cw = Number(this.contextWindow);
    if (this.summaryRange && this.summaryRange !== '5') compact.sr = this.summaryRange;
    if (this.summaryRange === 'custom' && this.summaryCustomMin && Number(this.summaryCustomMin) !== 5) {
      compact.sm = Number(this.summaryCustomMin);
    }
    if (this.gain && this.gain !== '2.5') compact.g = this.gain;
    if (this.vadMode && this.vadMode !== 'auto') compact.vm = this.vadMode;
    if (this.engineMode && this.engineMode !== 'auto') compact.em = this.engineMode;
    if (this.liveModel && this.liveModel !== DEFAULT_SETTINGS.DEFAULT_LIVE_MODEL) compact.lm = this.liveModel;
    if (this.autoSave) compact.as = 1;
    if (this.docMode && this.docMode !== 'new') compact.dm = this.docMode;
    if (this.folderId && this.folderId !== DEFAULT_SETTINGS.DEFAULT_FOLDER_ID) compact.f = this.folderId;
    if (this.lastDocId && this.docMode === 'existing') compact.ld = this.lastDocId;

    // 翻訳プロンプト追記：プリセット一致時はIDのみ('@hinglish', '@audit'等)で超軽量同期
    const trimmedCustomPrompt = (this.translationCustomPrompt || '').trim();
    if (trimmedCustomPrompt) {
      const matchedPreset = Object.entries(TRANSLATION_PROMPT_PRESETS).find(([, val]) => val.trim() === trimmedCustomPrompt);
      if (matchedPreset) {
        compact.tp = `@${matchedPreset[0]}`;
      } else if (includeFreePrompts) {
        compact.tp = trimmedCustomPrompt;
      }
    }

    // systemInstruction：既定値から変更され、かつ明示チェック時のみ格納
    const trimmedSys = (this.systemInstruction || '').trim();
    if (includeFreePrompts && trimmedSys && !isDefaultOrLegacySystemInstruction(trimmedSys)) {
      compact.si = trimmedSys;
    }

    return compact;
  }

  _renderQrCode() {
    const includePrompts = !!this.elCheckQrIncludePrompts?.checked;
    const compact = this._buildCompactSharePayload(includePrompts);
    const baseUrl = window.location.origin + window.location.pathname;
    const buildUrl = (obj) => `${baseUrl}#s=${encodeBase64UrlUtf8(JSON.stringify(obj))}`;

    let shareUrl = buildUrl(compact);
    this.elInputShareUrl.value = shareUrl;

    if (window.QRCode && QRCode.renderCanvas && this.elQrCanvas) {
      const renderOpts = { size: 280, margin: 4, dark: '#000000', light: '#FFFFFF' };
      let meta;
      try {
        meta = QRCode.renderCanvas(this.elQrCanvas, shareUrl, renderOpts);
      } catch (qrOverflowErr) {
        delete compact.si;
        delete compact.tp;
        shareUrl = buildUrl(compact);
        this.elInputShareUrl.value = shareUrl;
        meta = QRCode.renderCanvas(this.elQrCanvas, shareUrl, renderOpts);
        this.showToast('プロンプトが長すぎるため、QRコードからは自由記述プロンプトを省略しました。', 'warning');
      }

      if (this.elQrDensityMeta && meta) {
        const isDense = meta.version >= 15;
        this.elQrDensityMeta.className = isDense ? 'qr-density-meta is-dense' : 'qr-density-meta';
        this.elQrDensityMeta.textContent = isDense
          ? `⚠️ QR v${meta.version} (${meta.moduleCount}×${meta.moduleCount} / ${meta.length}文字) — やや高密度です（プロンプト除外で軽量化できます）`
          : `✅ QR v${meta.version} (${meta.moduleCount}×${meta.moduleCount} / ${meta.length}文字) — 高速スキャン対応（軽量最適化済）`;
      }
    }
  }

  _openQrModal() {
    if (!this.apiKey && !this.gasUrl) {
      this.showToast('先に「⚙️ 設定」でGemini APIキーまたはGAS設定を入力してください。', 'warning');
      this._openSettingsModal();
      return;
    }

    try {
      if (this.elCheckQrIncludePrompts) {
        this.elCheckQrIncludePrompts.checked = false;
      }
      this._renderQrCode();
      this.elQrModal.style.display = 'flex';
      document.body.classList.add('modal-open');
      this.log('info', `スマホ連携用QRコードを表示しました (URL長: ${this.elInputShareUrl.value.length}文字)。`);
    } catch (err) {
      console.error('Failed to generate QR code:', err);
      this.showToast('QRコードの生成に失敗しました: ' + err.message, 'error');
    }
  }

  _checkHashConfig() {
    const hash = window.location.hash;
    if (!hash || (!hash.startsWith('#s=') && !hash.startsWith('#setup='))) return;

    try {
      const K = ConfigManager.STORAGE_KEYS;

      if (hash.startsWith('#s=')) {
        // v3.2.0 超軽量コンパクト形式 (#s=<base64url>)
        const c = JSON.parse(decodeBase64UrlUtf8(hash.substring(3)));

        if (c.k) ConfigManager.set(K.API_KEY, String(c.k));
        if (c.gd) ConfigManager.set(K.GAS_URL, `https://script.google.com/macros/s/${c.gd}/exec`);
        else if (c.gu) ConfigManager.set(K.GAS_URL, String(c.gu));
        ConfigManager.set(K.GAS_TOKEN, c.t ? String(c.t) : '');

        ConfigManager.set(K.RECOGNITION_PROFILE, c.rp || DEFAULT_SETTINGS.DEFAULT_RECOGNITION_PROFILE);
        ConfigManager.set(K.DIRECTION, c.d || 'auto');
        ConfigManager.set(K.PARTNER_LANG, c.pl || DEFAULT_SETTINGS.DEFAULT_PARTNER_LANG);
        ConfigManager.set(K.CUSTOM_LANGS, c.cl || DEFAULT_SETTINGS.DEFAULT_CUSTOM_LANGS.join(','));
        ConfigManager.set(K.CATEGORY, c.c || DEFAULT_SETTINGS.DEFAULT_CATEGORY);
        ConfigManager.set(K.CHUNK_MODE, c.cm || 'long');
        ConfigManager.set(K.CONTEXT_WINDOW, String(c.cw !== undefined ? c.cw : 6));
        ConfigManager.set(K.SUMMARY_RANGE, c.sr || '5');
        ConfigManager.set(K.SUMMARY_CUSTOM_MIN, String(c.sm !== undefined ? c.sm : 5));
        ConfigManager.set(K.GAIN, c.g || '2.5');
        ConfigManager.set(K.VAD_MODE, c.vm || 'auto');
        ConfigManager.set(K.ENGINE_MODE, c.em || 'auto');
        ConfigManager.set(K.LIVE_MODEL, c.lm || DEFAULT_SETTINGS.DEFAULT_LIVE_MODEL);
        ConfigManager.set(K.AUTO_SAVE, String(Boolean(c.as)));
        ConfigManager.set(K.DOC_MODE, c.dm || 'new');
        ConfigManager.set(K.FOLDER_ID, c.f || DEFAULT_SETTINGS.DEFAULT_FOLDER_ID);
        if (c.ld !== undefined) ConfigManager.set(K.LAST_DOC_ID, String(c.ld));

        if (c.tp !== undefined) {
          const tpStr = String(c.tp);
          if (tpStr.startsWith('@') && TRANSLATION_PROMPT_PRESETS[tpStr.slice(1)]) {
            ConfigManager.set(K.TRANSLATION_CUSTOM_PROMPT, TRANSLATION_PROMPT_PRESETS[tpStr.slice(1)]);
          } else {
            ConfigManager.set(K.TRANSLATION_CUSTOM_PROMPT, tpStr);
          }
        }
        if (c.si !== undefined) {
          ConfigManager.set(K.SYSTEM_INSTRUCTION, String(c.si));
        }
      } else {
        // 旧形式 (#setup=...) 後方互換サポート
        const config = JSON.parse(decodeBase64Utf8(decodeURIComponent(hash.substring(7))));
        const legacyMap = [
          ['apiKey', K.API_KEY],
          ['gasUrl', K.GAS_URL],
          ['gasToken', K.GAS_TOKEN],
          ['recognitionProfile', K.RECOGNITION_PROFILE],
          ['direction', K.DIRECTION],
          ['partnerLang', K.PARTNER_LANG],
          ['customLangs', K.CUSTOM_LANGS],
          ['category', K.CATEGORY],
          ['chunkMode', K.CHUNK_MODE],
          ['summaryRange', K.SUMMARY_RANGE],
          ['gain', K.GAIN],
          ['vadMode', K.VAD_MODE],
          ['engineMode', K.ENGINE_MODE],
          ['liveModel', K.LIVE_MODEL],
          ['systemInstruction', K.SYSTEM_INSTRUCTION],
          ['docMode', K.DOC_MODE],
          ['lastDocId', K.LAST_DOC_ID],
          ['folderId', K.FOLDER_ID]
        ];
        for (const [field, storageKey] of legacyMap) {
          if (config[field]) ConfigManager.set(storageKey, String(config[field]));
        }
        if (config.contextWindow !== undefined) ConfigManager.set(K.CONTEXT_WINDOW, String(config.contextWindow));
        if (config.summaryCustomMin !== undefined) ConfigManager.set(K.SUMMARY_CUSTOM_MIN, String(config.summaryCustomMin));
        if (config.translationCustomPrompt !== undefined) ConfigManager.set(K.TRANSLATION_CUSTOM_PROMPT, String(config.translationCustomPrompt));
        if (config.autoSave !== undefined) ConfigManager.set(K.AUTO_SAVE, String(config.autoSave));
      }

      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }

      this._loadSettings();
      this.log('success', 'スマホ連携: PC設定情報（APIキー・GAS設定）を即座にインポートしました！');
      this.showToast('📱 PCからの設定をインポートしました！', 'success');
    } catch (err) {
      console.warn('Failed to parse setup hash:', err);
      this.log('error', `設定インポート失敗: ${err.message}`);
    }
  }

  showToast(message, type = 'info') {
    if (!this.elToastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const iconMap = { success: '✅', error: '⚠️', warning: '🔔', info: 'ℹ️' };
    toast.innerHTML = `<span>${iconMap[type] || 'ℹ️'}</span><span>${this._escapeHTML(message)}</span>`;
    this.elToastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s, transform 0.3s';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  _escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
  });
}
