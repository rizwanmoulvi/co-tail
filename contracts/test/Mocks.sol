// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockERC20 is ERC20 {
    constructor(string memory n, string memory s) ERC20(n, s) {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

/// A router that pays `rate` units of tokenOut per unit of tokenIn, and can be told to
/// take less than it was offered or to pay nothing, to exercise the mirror's checks.
contract MockRouter {
    uint256 public takeFraction = 1e18; // 1e18 = take all of amountIn
    bool public payNothing;

    function setTakeFraction(uint256 f) external { takeFraction = f; }
    function setPayNothing(bool v) external { payNothing = v; }

    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 rate, address recipient) external {
        uint256 take = amountIn * takeFraction / 1e18;
        IERC20(tokenIn).transferFrom(msg.sender, address(this), take);
        if (!payNothing) MockERC20(tokenOut).mint(recipient, take * rate / 1e18);
    }
}
