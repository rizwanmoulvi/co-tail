// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TailcoatMirror} from "../src/TailcoatMirror.sol";
import {MockERC20, MockRouter} from "./Mocks.sol";

/// Requirements under test (docs/ARCHITECTURE.md, "Custody model"):
///  - following is an approval plus caps the follower sets; the operator can only swap approved cash
///    into allowed stocks through allowed routers, and the stock lands in the follower's wallet
///  - the follower's own per-trade cap and daily cap bind every mirror
///  - a follower can pause; a non-operator can never mirror
///  - a short fill (below minOut) or an empty fill reverts and the follower keeps their cash
///  - cash the router did not take goes back to the follower in the same transaction
///  - a receipt is an event carrying the filing hash
contract TailcoatMirrorTest is Test {
    MockERC20 usdt;
    MockERC20 nvdab;
    MockRouter router;
    TailcoatMirror mirror;

    address owner = makeAddr("owner");
    address operator = makeAddr("operator");
    address alice = makeAddr("alice");
    bytes32 filing = keccak256("filing-1");

    function setUp() public {
        usdt = new MockERC20("Tether", "USDT");
        nvdab = new MockERC20("NVIDIA Corp", "NVDAB");
        router = new MockRouter();
        mirror = new TailcoatMirror(IERC20(address(usdt)), operator, owner);

        address[] memory stocks = new address[](1);
        stocks[0] = address(nvdab);
        address[] memory routers = new address[](1);
        routers[0] = address(router);
        vm.startPrank(owner);
        mirror.setStocks(stocks, true);
        mirror.setRouters(routers, true);
        vm.stopPrank();

        usdt.mint(alice, 1_000e18);
        vm.startPrank(alice);
        usdt.approve(address(mirror), type(uint256).max);
        mirror.setLimits(50e18, 100e18);
        vm.stopPrank();
    }

    function _buyData(uint256 amountIn, uint256 rate) internal view returns (bytes memory) {
        return abi.encodeCall(MockRouter.swap, (address(usdt), address(nvdab), amountIn, rate, address(mirror)));
    }

    function test_buyLandsInFollowerWalletAndNothingStaysInMirror() public {
        vm.prank(operator);
        uint256 out = mirror.mirrorBuy(alice, filing, address(nvdab), 20e18, 0.08e18, address(router), address(router), _buyData(20e18, 0.005e18));
        assertEq(out, 0.1e18);
        assertEq(nvdab.balanceOf(alice), 0.1e18, "stock goes to the follower");
        assertEq(usdt.balanceOf(alice), 980e18, "follower paid exactly the mirror amount");
        assertEq(nvdab.balanceOf(address(mirror)), 0, "mirror holds no stock");
        assertEq(usdt.balanceOf(address(mirror)), 0, "mirror holds no cash");
        assertEq(usdt.allowance(address(mirror), address(router)), 0, "router allowance reset");
    }

    function test_buyEmitsMirroredWithFilingHash() public {
        vm.expectEmit(true, true, true, true);
        emit TailcoatMirror.Mirrored(alice, filing, address(nvdab), true, 20e18, 0.1e18, address(router));
        vm.prank(operator);
        mirror.mirrorBuy(alice, filing, address(nvdab), 20e18, 0, address(router), address(router), _buyData(20e18, 0.005e18));
    }

    function test_nonOperatorCannotMirror() public {
        vm.prank(alice);
        vm.expectRevert(TailcoatMirror.NotOperator.selector);
        mirror.mirrorBuy(alice, filing, address(nvdab), 20e18, 0, address(router), address(router), _buyData(20e18, 0.005e18));
    }

    function test_overPerTradeCapReverts() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(TailcoatMirror.OverPerTrade.selector, 51e18, 50e18));
        mirror.mirrorBuy(alice, filing, address(nvdab), 51e18, 0, address(router), address(router), _buyData(51e18, 0.005e18));
    }

    function test_dailyCapBindsAcrossMirrorsAndResetsNextDay() public {
        vm.startPrank(operator);
        mirror.mirrorBuy(alice, filing, address(nvdab), 50e18, 0, address(router), address(router), _buyData(50e18, 0.005e18));
        mirror.mirrorBuy(alice, filing, address(nvdab), 50e18, 0, address(router), address(router), _buyData(50e18, 0.005e18));
        assertEq(mirror.spendable(alice), 0);
        vm.expectRevert(abi.encodeWithSelector(TailcoatMirror.OverDailyCap.selector, 1e18, 0));
        mirror.mirrorBuy(alice, filing, address(nvdab), 1e18, 0, address(router), address(router), _buyData(1e18, 0.005e18));
        vm.warp(block.timestamp + 1 days);
        assertEq(mirror.spendable(alice), 50e18);
        mirror.mirrorBuy(alice, filing, address(nvdab), 10e18, 0, address(router), address(router), _buyData(10e18, 0.005e18));
        vm.stopPrank();
        assertEq(usdt.balanceOf(alice), 890e18);
    }

    function test_pausedFollowerIsNotMirrored() public {
        vm.prank(alice);
        mirror.setPaused(true);
        assertEq(mirror.spendable(alice), 0);
        vm.prank(operator);
        vm.expectRevert(TailcoatMirror.FollowerPaused.selector);
        mirror.mirrorBuy(alice, filing, address(nvdab), 10e18, 0, address(router), address(router), _buyData(10e18, 0.005e18));
    }

    function test_unknownStockOrRouterReverts() public {
        MockERC20 other = new MockERC20("Other", "OTH");
        vm.startPrank(operator);
        vm.expectRevert(TailcoatMirror.NotAllowed.selector);
        mirror.mirrorBuy(alice, filing, address(other), 10e18, 0, address(router), address(router), "");
        vm.expectRevert(TailcoatMirror.NotAllowed.selector);
        mirror.mirrorBuy(alice, filing, address(nvdab), 10e18, 0, address(0xBAD), address(router), "");
        vm.expectRevert(TailcoatMirror.NotAllowed.selector);
        mirror.mirrorBuy(alice, filing, address(nvdab), 10e18, 0, address(router), address(0xBAD), "");
        vm.stopPrank();
    }

    function test_shortFillRevertsAndFollowerKeepsCash() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(TailcoatMirror.TooLittleOut.selector, 0.1e18, 0.2e18));
        mirror.mirrorBuy(alice, filing, address(nvdab), 20e18, 0.2e18, address(router), address(router), _buyData(20e18, 0.005e18));
        assertEq(usdt.balanceOf(alice), 1_000e18);
        assertEq(mirror.spendable(alice), 50e18, "a reverted mirror does not count against the day");
    }

    function test_emptyFillReverts() public {
        router.setPayNothing(true);
        vm.prank(operator);
        vm.expectRevert(TailcoatMirror.NothingOut.selector);
        mirror.mirrorBuy(alice, filing, address(nvdab), 20e18, 0, address(router), address(router), _buyData(20e18, 0.005e18));
    }

    function test_unspentCashIsRefundedToFollower() public {
        router.setTakeFraction(0.5e18);
        vm.prank(operator);
        mirror.mirrorBuy(alice, filing, address(nvdab), 20e18, 0, address(router), address(router), _buyData(20e18, 0.005e18));
        assertEq(usdt.balanceOf(alice), 990e18, "half was not taken and came back");
        assertEq(usdt.balanceOf(address(mirror)), 0);
    }

    function test_sellReturnsCashToFollower() public {
        nvdab.mint(alice, 1e18);
        vm.prank(alice);
        nvdab.approve(address(mirror), type(uint256).max);
        bytes memory data = abi.encodeCall(MockRouter.swap, (address(nvdab), address(usdt), 1e18, 200e18, address(mirror)));
        vm.prank(operator);
        uint256 out = mirror.mirrorSell(alice, filing, address(nvdab), 1e18, 199e18, address(router), address(router), data);
        assertEq(out, 200e18);
        assertEq(usdt.balanceOf(alice), 1_200e18);
        assertEq(nvdab.balanceOf(alice), 0);
        assertEq(nvdab.balanceOf(address(mirror)), 0);
    }

    function test_receiptIsAnEventWithTheFilingHash() public {
        bytes32 h = sha256("pdf bytes");
        vm.expectEmit(true, false, false, true);
        emit TailcoatMirror.Receipt(h, "20034836", 3, 2);
        vm.prank(operator);
        mirror.receipt(h, "20034836", 3, 2);
    }

    function test_onlyOperatorWritesReceipts() public {
        vm.prank(alice);
        vm.expectRevert(TailcoatMirror.NotOperator.selector);
        mirror.receipt(bytes32(0), "x", 0, 0);
    }
}
