using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace TaylorAccess.API.Controllers;

[ApiController]
[Route("api/v1/paychecks")]
[Authorize]
public class PaychecksController : ControllerBase
{
    [HttpGet]
    public ActionResult<object> GetPaychecks(
        [FromQuery] string? status,
        [FromQuery] int pageSize = 25,
        [FromQuery] int page = 1)
    {
        return Ok(new { data = Array.Empty<object>(), total = 0, page, pageSize });
    }
}
