// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/// @title TailcoatMirror
/// @notice Non-custodial executor for Tailcoat. A follower approves cash (USDT) to this contract
///         and sets their own caps. The operator can then only do one thing with it: swap it into
///         an allowed tokenized stock through an allowed router, with the output landing in the
///         follower's own wallet in the same transaction. Nothing is pooled and nothing stays here.
contract TailcoatMirror is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The cash token followers spend (USDT on BSC).
    IERC20 public immutable cash;
    /// @notice The key that runs the worker. It can mirror, write receipts, nothing else.
    address public operator;

    /// @notice Tokenized stocks the operator may buy or sell. Maintained by the owner from the RWA list.
    mapping(address => bool) public allowedStock;
    /// @notice Contracts the mirror may approve and call: swap routers and their token spenders.
    mapping(address => bool) public allowedRouter;

    struct Limits {
        uint128 maxPerTrade;
        uint128 dailyCap;
        uint128 spentToday;
        uint40 day;
        bool paused;
    }

    /// @notice Each follower's own caps. Set by the follower, never by the operator.
    mapping(address => Limits) public limits;

    event OperatorSet(address indexed operator);
    event StockAllowed(address indexed stock, bool allowed);
    event RouterAllowed(address indexed router, bool allowed);
    event LimitsSet(address indexed follower, uint128 maxPerTrade, uint128 dailyCap);
    event Paused(address indexed follower, bool paused);
    /// @notice A public filing was read. `sha256Hash` is the hash of the exact bytes the agent read.
    event Receipt(bytes32 indexed sha256Hash, string docId, uint16 trades, uint16 mirrorable);
    /// @notice One mirror for one follower. `filing` is the receipt hash the fill traces back to.
    event Mirrored(
        address indexed follower,
        bytes32 indexed filing,
        address indexed stock,
        bool buy,
        uint256 cashAmount,
        uint256 stockAmount,
        address router
    );

    error NotOperator();
    error NotAllowed();
    error FollowerPaused();
    error OverPerTrade(uint256 amount, uint256 cap);
    error OverDailyCap(uint256 amount, uint256 left);
    error TooLittleOut(uint256 got, uint256 min);
    error NothingOut();

    constructor(IERC20 cash_, address operator_, address owner_) Ownable(owner_) {
        cash = cash_;
        operator = operator_;
        emit OperatorSet(operator_);
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    // ------------------------------------------------------------------ owner

    function setOperator(address operator_) external onlyOwner {
        operator = operator_;
        emit OperatorSet(operator_);
    }

    function setStocks(address[] calldata stocks, bool allowed) external onlyOwner {
        for (uint256 i = 0; i < stocks.length; i++) {
            allowedStock[stocks[i]] = allowed;
            emit StockAllowed(stocks[i], allowed);
        }
    }

    function setRouters(address[] calldata routers, bool allowed) external onlyOwner {
        for (uint256 i = 0; i < routers.length; i++) {
            allowedRouter[routers[i]] = allowed;
            emit RouterAllowed(routers[i], allowed);
        }
    }

    // --------------------------------------------------------------- follower

    /// @notice Following is an ERC-20 approval of `cash` to this contract plus these caps.
    ///         Unfollowing is revoking the approval from any wallet, or `setPaused(true)`.
    function setLimits(uint128 maxPerTrade, uint128 dailyCap) external {
        Limits storage l = limits[msg.sender];
        l.maxPerTrade = maxPerTrade;
        l.dailyCap = dailyCap;
        l.paused = false;
        emit LimitsSet(msg.sender, maxPerTrade, dailyCap);
    }

    function setPaused(bool paused) external {
        limits[msg.sender].paused = paused;
        emit Paused(msg.sender, paused);
    }

    /// @notice Cash the follower can still spend today under their own caps.
    function spendable(address follower) public view returns (uint256) {
        Limits memory l = limits[follower];
        if (l.paused) return 0;
        uint256 left = l.dailyCap;
        if (l.day == _today()) left = l.dailyCap > l.spentToday ? l.dailyCap - l.spentToday : 0;
        return left < l.maxPerTrade ? left : l.maxPerTrade;
    }

    // --------------------------------------------------------------- operator

    function receipt(bytes32 sha256Hash, string calldata docId, uint16 trades, uint16 mirrorable) external onlyOperator {
        emit Receipt(sha256Hash, docId, trades, mirrorable);
    }

    /// @notice Spend `cashAmount` of the follower's cash on `stock` through `router`.
    /// @param spender The contract the router pulls tokens through (often the router itself).
    /// @param data    Swap calldata built off-chain with this contract as the sender and recipient.
    function mirrorBuy(
        address follower,
        bytes32 filing,
        address stock,
        uint256 cashAmount,
        uint256 minStockOut,
        address router,
        address spender,
        bytes calldata data
    ) external onlyOperator nonReentrant returns (uint256 stockOut) {
        if (!allowedStock[stock] || !allowedRouter[router] || !allowedRouter[spender]) revert NotAllowed();
        _charge(follower, cashAmount);
        cash.safeTransferFrom(follower, address(this), cashAmount);
        stockOut = _swap(cash, IERC20(stock), cashAmount, minStockOut, router, spender, data, follower);
        emit Mirrored(follower, filing, stock, true, cashAmount, stockOut, router);
    }

    /// @notice Sell `stockAmount` of the follower's `stock` back to cash through `router`.
    ///         Needs the follower's approval of `stock` to this contract.
    function mirrorSell(
        address follower,
        bytes32 filing,
        address stock,
        uint256 stockAmount,
        uint256 minCashOut,
        address router,
        address spender,
        bytes calldata data
    ) external onlyOperator nonReentrant returns (uint256 cashOut) {
        if (!allowedStock[stock] || !allowedRouter[router] || !allowedRouter[spender]) revert NotAllowed();
        if (limits[follower].paused) revert FollowerPaused();
        IERC20(stock).safeTransferFrom(follower, address(this), stockAmount);
        cashOut = _swap(IERC20(stock), cash, stockAmount, minCashOut, router, spender, data, follower);
        emit Mirrored(follower, filing, stock, false, cashOut, stockAmount, router);
    }

    // --------------------------------------------------------------- internal

    function _charge(address follower, uint256 amount) internal {
        Limits storage l = limits[follower];
        if (l.paused) revert FollowerPaused();
        if (amount > l.maxPerTrade) revert OverPerTrade(amount, l.maxPerTrade);
        uint40 today = _today();
        if (l.day != today) {
            l.day = today;
            l.spentToday = 0;
        }
        uint256 left = l.dailyCap > l.spentToday ? l.dailyCap - l.spentToday : 0;
        if (amount > left) revert OverDailyCap(amount, left);
        l.spentToday += uint128(amount);
    }

    function _swap(
        IERC20 tokenIn,
        IERC20 tokenOut,
        uint256 amountIn,
        uint256 minOut,
        address router,
        address spender,
        bytes calldata data,
        address recipient
    ) internal returns (uint256 out) {
        uint256 outBefore = tokenOut.balanceOf(address(this));
        uint256 inBefore = tokenIn.balanceOf(address(this));
        tokenIn.forceApprove(spender, amountIn);
        Address.functionCall(router, data);
        tokenIn.forceApprove(spender, 0);
        out = tokenOut.balanceOf(address(this)) - outBefore;
        if (out == 0) revert NothingOut();
        if (out < minOut) revert TooLittleOut(out, minOut);
        tokenOut.safeTransfer(recipient, out);
        // Anything the router did not take goes straight back.
        uint256 inAfter = tokenIn.balanceOf(address(this));
        uint256 unspent = inAfter + amountIn > inBefore ? inAfter + amountIn - inBefore : 0;
        if (unspent > 0) tokenIn.safeTransfer(recipient, unspent);
    }

    function _today() internal view returns (uint40) {
        return uint40(block.timestamp / 1 days);
    }
}
