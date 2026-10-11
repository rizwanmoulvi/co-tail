// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TailcoatMirror} from "../src/TailcoatMirror.sol";

interface IPancakeV3SwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/// Requirement: a real mirror on BSC mainnet. Runs only with BSC_RPC_URL set:
///   BSC_RPC_URL=https://bsc-dataseed.binance.org forge test --match-contract Fork
contract ForkTest is Test {
    address constant USDT = 0x55d398326f99059fF775485246999027B3197955;
    address constant NVDAB = 0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436;
    address constant PCS_V3_ROUTER = 0x1b81D678ffb9C0263b24A97847620C99d213eB14;

    function test_buyNvdabOnPancakeV3LandsInFollowerWallet() public {
        string memory rpc = vm.envOr("BSC_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);

        address owner = makeAddr("owner");
        address operator = makeAddr("operator");
        address alice = makeAddr("alice");
        TailcoatMirror mirror = new TailcoatMirror(IERC20(USDT), operator, owner);

        address[] memory stocks = new address[](1);
        stocks[0] = NVDAB;
        address[] memory routers = new address[](1);
        routers[0] = PCS_V3_ROUTER;
        vm.startPrank(owner);
        mirror.setStocks(stocks, true);
        mirror.setRouters(routers, true);
        vm.stopPrank();

        deal(USDT, alice, 100e18);
        vm.startPrank(alice);
        IERC20(USDT).approve(address(mirror), type(uint256).max);
        mirror.setLimits(50e18, 100e18);
        vm.stopPrank();

        bytes memory data = abi.encodeCall(
            IPancakeV3SwapRouter.exactInputSingle,
            (IPancakeV3SwapRouter.ExactInputSingleParams({
                tokenIn: USDT,
                tokenOut: NVDAB,
                fee: 2500,
                recipient: address(mirror),
                deadline: block.timestamp + 600,
                amountIn: 10e18,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            }))
        );
        vm.prank(operator);
        uint256 out = mirror.mirrorBuy(alice, keccak256("fork"), NVDAB, 10e18, 0.03e18, PCS_V3_ROUTER, PCS_V3_ROUTER, data);
        emit log_named_decimal_uint("NVDAB received for 10 USDT", out, 18);
        assertGt(out, 0.03e18, "about 1/230 of a share per USDT");
        assertEq(IERC20(NVDAB).balanceOf(alice), out);
        assertEq(IERC20(USDT).balanceOf(alice), 90e18);
        assertEq(IERC20(NVDAB).balanceOf(address(mirror)), 0);
        assertEq(IERC20(USDT).balanceOf(address(mirror)), 0);
    }
}
